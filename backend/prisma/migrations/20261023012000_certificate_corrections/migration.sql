-- Each issuance retains its own immutable academic snapshot.
DO $results$
DECLARE item record;
BEGIN
  FOR item IN SELECT c.conname FROM pg_constraint c WHERE c.conrelid='public.resultados_curso'::regclass AND c.contype='u'
    AND (SELECT array_agg(a.attname::text) FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k)=ARRAY['inscripcion_id']::text[]
  LOOP EXECUTE format('ALTER TABLE public.resultados_curso DROP CONSTRAINT %I',item.conname); END LOOP;
  FOR item IN SELECT ci.relname FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid
    WHERE i.indrelid='public.resultados_curso'::regclass AND i.indisunique AND NOT i.indisprimary
    AND (SELECT array_agg(a.attname::text) FROM unnest(i.indkey::smallint[]) k JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k)=ARRAY['inscripcion_id']::text[]
  LOOP EXECUTE format('DROP INDEX public.%I',item.relname); END LOOP;
END $results$;
ALTER TABLE public.certificados ADD COLUMN IF NOT EXISTS inscripcion_id integer REFERENCES public.inscripciones(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reemplaza_certificado_id bigint REFERENCES public.certificados(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS motivo_reemision text;
UPDATE public.certificados c SET inscripcion_id=r.inscripcion_id FROM public.resultados_curso r WHERE r.id=c.resultado_curso_id AND c.inscripcion_id IS NULL;
ALTER TABLE public.certificados ALTER COLUMN inscripcion_id SET NOT NULL;
-- Normalize the already-revoked state; public verification previously used either source.
UPDATE public.certificados c SET estado='anulado' WHERE c.estado::text='valido' AND EXISTS(SELECT 1 FROM public.anulaciones_certificados a WHERE a.certificado_id=c.id);
CREATE UNIQUE INDEX IF NOT EXISTS certificados_inscripcion_vigente_key ON public.certificados(inscripcion_id) WHERE estado='valido';
CREATE UNIQUE INDEX IF NOT EXISTS certificados_reemplazo_key ON public.certificados(reemplaza_certificado_id) WHERE reemplaza_certificado_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.emit_certificate_for_type(p_enrollment_id bigint,p_code text,p_public_url text,p_actor_id bigint,p_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $issue$
DECLARE selected_course bigint; result_id bigint; previous_id bigint; assessment record;
  result_state public.resultados_curso.estado%TYPE; saved public.certificados;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_actor_id AND rol::text='administrador' AND activo IS TRUE) THEN
    RAISE EXCEPTION 'Forbidden actor' USING ERRCODE='P0403'; END IF;
  SELECT curso_id INTO selected_course FROM public.inscripciones WHERE id=p_enrollment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment not found' USING ERRCODE='P0404'; END IF;
  PERFORM 1 FROM public.cursos WHERE id=selected_course FOR UPDATE;
  PERFORM 1 FROM public.inscripciones WHERE id=p_enrollment_id AND curso_id=selected_course FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment changed' USING ERRCODE='P0404'; END IF;
  IF EXISTS(SELECT 1 FROM public.certificados WHERE inscripcion_id=p_enrollment_id AND estado::text='valido') THEN
    RAISE EXCEPTION 'Already issued' USING ERRCODE='P0409'; END IF;
  SELECT * INTO assessment FROM public.certificate_assessment_for_type(selected_course,p_type) a WHERE a.enrollment_id=p_enrollment_id;
  IF NOT FOUND OR assessment.approval_status<>'APROBADO' OR assessment.blocked_reason IS NOT NULL
    OR (p_type='aprobacion' AND NOT assessment.academic_met) OR NOT assessment.attendance_met THEN
    RAISE EXCEPTION 'Approval requirements not met' USING ERRCODE='P0400'; END IF;
  SELECT id INTO previous_id FROM public.certificados WHERE inscripcion_id=p_enrollment_id ORDER BY id DESC LIMIT 1;
  IF previous_id IS NOT NULL AND coalesce(current_setting('eva.reissue_certificate',true),'')<>previous_id::text THEN
    RAISE EXCEPTION 'Use reissue with a correction reason' USING ERRCODE='P0409'; END IF;
  IF assessment.final_grade IS NULL THEN result_state:='pendiente';
  ELSIF assessment.academic_met AND assessment.attendance_met THEN result_state:='aprobado';
  ELSE result_state:='reprobado'; END IF;
  INSERT INTO public.resultados_curso(inscripcion_id,nota_final,porcentaje_asistencia,cumple_nota,cumple_asistencia,estado,fecha_resultado)
  VALUES(p_enrollment_id,assessment.final_grade,assessment.attendance_percent,assessment.academic_met,assessment.attendance_met,result_state,now()) RETURNING id INTO result_id;
  INSERT INTO public.certificados(resultado_curso_id,inscripcion_id,reemplaza_certificado_id,codigo_verificacion,tipo,url_verificacion,codigo_qr,datos_emision)
  VALUES(result_id,p_enrollment_id,previous_id,p_code,p_type::public.tipo_certificado,p_public_url,p_public_url,
    jsonb_build_object('version',1,'participantName',assessment.participant_name,'courseName',assessment.course_name,'durationHours',assessment.duration_hours)) RETURNING * INTO saved;
  RETURN to_jsonb(saved)||jsonb_build_object('id',saved.id::text,'anulaciones_certificados','[]'::jsonb);
END $issue$;

CREATE OR REPLACE FUNCTION public.revoke_certificate(p_certificate_id bigint,p_actor_id bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $revoke$
DECLARE selected_course bigint; enrollment_id bigint; saved public.certificados;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_actor_id AND rol::text='administrador' AND activo IS TRUE) THEN
    RAISE EXCEPTION 'Forbidden actor' USING ERRCODE='P0403'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Reason required' USING ERRCODE='P0400'; END IF;
  SELECT i.curso_id,i.id INTO selected_course,enrollment_id FROM public.certificados c JOIN public.inscripciones i ON i.id=c.inscripcion_id WHERE c.id=p_certificate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificate not found' USING ERRCODE='P0404'; END IF;
  PERFORM 1 FROM public.cursos WHERE id=selected_course FOR UPDATE;
  PERFORM 1 FROM public.inscripciones WHERE id=enrollment_id FOR UPDATE;
  SELECT * INTO saved FROM public.certificados WHERE id=p_certificate_id FOR UPDATE;
  IF saved.estado::text<>'valido' THEN RAISE EXCEPTION 'Already revoked' USING ERRCODE='P0409'; END IF;
  UPDATE public.certificados SET estado='anulado' WHERE id=p_certificate_id RETURNING * INTO saved;
  INSERT INTO public.anulaciones_certificados(certificado_id,anulado_por,motivo) VALUES(p_certificate_id,p_actor_id,btrim(p_reason));
  RETURN to_jsonb(saved)||jsonb_build_object('id',saved.id::text,'anulaciones_certificados',jsonb_build_array(jsonb_build_object('id',p_certificate_id::text)));
END $revoke$;

CREATE OR REPLACE FUNCTION public.reissue_certificate(p_certificate_id bigint,p_code text,p_public_url text,p_actor_id bigint,p_reason text,p_type text,p_template_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $reissue$
DECLARE selected_course bigint; enrollment_id bigint; previous public.certificados; result jsonb; saved public.certificados;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_actor_id AND rol::text='administrador' AND activo IS TRUE) THEN
    RAISE EXCEPTION 'Forbidden actor' USING ERRCODE='P0403'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Reason required' USING ERRCODE='P0400'; END IF;
  SELECT i.curso_id,i.id INTO selected_course,enrollment_id FROM public.certificados c JOIN public.inscripciones i ON i.id=c.inscripcion_id WHERE c.id=p_certificate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificate not found' USING ERRCODE='P0404'; END IF;
  PERFORM 1 FROM public.cursos WHERE id=selected_course FOR UPDATE;
  PERFORM 1 FROM public.inscripciones WHERE id=enrollment_id FOR UPDATE;
  SELECT * INTO previous FROM public.certificados WHERE id=p_certificate_id FOR UPDATE;
  IF previous.estado::text<>'anulado' OR EXISTS(SELECT 1 FROM public.certificados WHERE inscripcion_id=enrollment_id AND id>p_certificate_id) THEN
    RAISE EXCEPTION 'Revoke the latest certificate before reissuing' USING ERRCODE='P0409'; END IF;
  PERFORM set_config('eva.reissue_certificate',p_certificate_id::text,true);
  IF p_template_id IS NULL THEN result:=public.emit_certificate_for_type(enrollment_id,p_code,p_public_url,p_actor_id,p_type);
  ELSE result:=public.emit_certificate_with_template(enrollment_id,p_code,p_public_url,p_actor_id,p_type,p_template_id); END IF;
  PERFORM set_config('eva.reissue_certificate','',true);
  UPDATE public.certificados SET motivo_reemision=btrim(p_reason) WHERE id=(result->>'id')::bigint RETURNING * INTO saved;
  RETURN to_jsonb(saved)||jsonb_build_object('id',saved.id::text,'anulaciones_certificados','[]'::jsonb);
END $reissue$;

CREATE OR REPLACE FUNCTION public.certificate_candidates_for_type(p_course_id bigint,p_type text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $roster$
  SELECT jsonb_build_object('course',jsonb_build_object('id',c.id::text,'name',c.nombre,'code',coalesce(c.codigo,'')),
    'students',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'enrollmentId',a.enrollment_id::text,'name',a.participant_name,'approvalStatus',a.approval_status,
      'blockedReason',CASE WHEN ct.estado::text='valido' THEN 'El certificado ya fue emitido.' ELSE a.blocked_reason END,
      'certificate',CASE WHEN ct.id IS NULL THEN NULL ELSE jsonb_build_object('id',ct.id::text,'code',ct.codigo_verificacion,
        'status',CASE WHEN ct.estado::text='valido' THEN 'VALID' ELSE 'REVOKED' END) END,
      'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id::text,'code',h.codigo_verificacion,'issuedAt',h.fecha_emision,
        'status',CASE WHEN h.estado::text='valido' THEN 'VALID' ELSE 'REVOKED' END,'revokedReason',an.motivo,
        'revokedAt',an.fecha_anulacion,'replacesId',h.reemplaza_certificado_id::text,'reissueReason',h.motivo_reemision) ORDER BY h.id DESC)
        FROM public.certificados h LEFT JOIN public.anulaciones_certificados an ON an.certificado_id=h.id WHERE h.inscripcion_id=a.enrollment_id),'[]'::jsonb)
    ) ORDER BY a.participant_name,a.enrollment_id) FROM public.certificate_assessment_for_type(c.id,p_type) a
      LEFT JOIN LATERAL(SELECT cc.* FROM public.certificados cc WHERE cc.inscripcion_id=a.enrollment_id ORDER BY (cc.estado::text='valido') DESC,cc.id DESC LIMIT 1) ct ON true),'[]'::jsonb))
  FROM public.cursos c WHERE c.id=p_course_id;
$roster$;

CREATE OR REPLACE FUNCTION public.certificate_candidates(p_course_id bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $legacy$
  SELECT public.certificate_candidates_for_type(p_course_id,'aprobacion');
$legacy$;

CREATE OR REPLACE FUNCTION public.preserve_issued_result() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $snapshot$
BEGIN
  IF EXISTS(SELECT 1 FROM public.certificados WHERE resultado_curso_id=OLD.id) THEN
    RAISE EXCEPTION 'Issued academic snapshots are immutable' USING ERRCODE='P0409'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $snapshot$;
DROP TRIGGER IF EXISTS preserve_issued_result ON public.resultados_curso;
CREATE TRIGGER preserve_issued_result BEFORE UPDATE OR DELETE ON public.resultados_curso FOR EACH ROW EXECUTE FUNCTION public.preserve_issued_result();
REVOKE ALL ON FUNCTION public.preserve_issued_result() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_certified_academic_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $academic$
DECLARE row_data jsonb; v_course_id bigint; v_enrollment_id bigint;
BEGIN
  row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_OP='UPDATE' AND TG_TABLE_NAME<>'cursos' AND (
    (to_jsonb(OLD)->'inscripcion_id') IS DISTINCT FROM (row_data->'inscripcion_id') OR
    (to_jsonb(OLD)->'curso_id') IS DISTINCT FROM (row_data->'curso_id') OR
    (to_jsonb(OLD)->'evaluacion_id') IS DISTINCT FROM (row_data->'evaluacion_id')) THEN
    RAISE EXCEPTION 'Academic records cannot be reassigned' USING ERRCODE='P0409'; END IF;
  IF TG_TABLE_NAME='cursos' THEN
    IF (to_jsonb(OLD)->'fecha_fin') IS NOT DISTINCT FROM (row_data->'fecha_fin') AND
       (to_jsonb(OLD)->'fecha_inicio') IS NOT DISTINCT FROM (row_data->'fecha_inicio') AND
       (to_jsonb(OLD)->'nota_minima') IS NOT DISTINCT FROM (row_data->'nota_minima') AND
       (to_jsonb(OLD)->'asistencia_minima') IS NOT DISTINCT FROM (row_data->'asistencia_minima') AND
       (to_jsonb(OLD)->'duracion_horas') IS NOT DISTINCT FROM (row_data->'duracion_horas') THEN RETURN NEW; END IF;
    v_course_id:=(row_data->>'id')::bigint;
  ELSIF TG_TABLE_NAME='calificaciones' THEN
    SELECT e.curso_id INTO v_course_id FROM public.evaluaciones e WHERE e.id=(row_data->>'evaluacion_id')::bigint;
    v_enrollment_id:=(row_data->>'inscripcion_id')::bigint;
  ELSE
    v_course_id:=(row_data->>'curso_id')::bigint;
    IF TG_TABLE_NAME='asistencias_participantes' THEN v_enrollment_id:=(row_data->>'inscripcion_id')::bigint; END IF;
  END IF;
  PERFORM 1 FROM public.cursos WHERE id=v_course_id FOR SHARE;
  IF EXISTS(SELECT 1 FROM public.certificados c JOIN public.inscripciones i ON i.id=c.inscripcion_id
    WHERE i.curso_id=v_course_id AND (v_enrollment_id IS NULL OR i.id=v_enrollment_id) AND c.estado::text='valido') THEN
    RAISE EXCEPTION 'Revoke affected certificates before changing academic data' USING ERRCODE='P0409'; END IF;
  UPDATE public.resultados_academicos_curso r SET estado='pendiente',nota_final=NULL,porcentaje_asistencia=NULL,fecha_calculo=NULL
    WHERE r.curso_id=v_course_id AND (v_enrollment_id IS NULL OR r.inscripcion_id=v_enrollment_id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $academic$;
DO $triggers$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sesiones','asistencias_participantes','evaluaciones','calificaciones'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_certified_changes ON public.%I',table_name);
    EXECUTE format('CREATE TRIGGER guard_certified_changes BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_certified_academic_change()',table_name);
  END LOOP;
END $triggers$;
DROP TRIGGER IF EXISTS guard_certified_course_changes ON public.cursos;
CREATE TRIGGER guard_certified_course_changes BEFORE UPDATE OF fecha_fin,fecha_inicio,nota_minima,asistencia_minima,duracion_horas ON public.cursos FOR EACH ROW EXECUTE FUNCTION public.guard_certified_academic_change();

REVOKE ALL ON FUNCTION public.guard_certified_academic_change() FROM PUBLIC,anon,authenticated;
DO $permissions$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.revoke_certificate(bigint,bigint,text)','public.reissue_certificate(bigint,text,text,bigint,text,text,bigint)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',signature);
  END LOOP;
END $permissions$;
NOTIFY pgrst,'reload schema';
