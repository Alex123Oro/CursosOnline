-- Targeted upgrade for the existing Supabase schema. No business rows are changed.
-- Run with scripts/apply-priority-corrections.mjs; do not replay historical migrations.
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;

-- All application data access goes through the backend (Prisma or service_role).
-- No public policies are needed for these tables, including public catalog prices:
-- the catalog and participant-type endpoints already expose their limited DTOs.
DO $permissions$
DECLARE table_name TEXT; role_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['inscripciones','pagos','precios_curso','tipos_participante'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, role_name);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
    END IF;
  END LOOP;
END $permissions$;

CREATE OR REPLACE FUNCTION public.certificate_assessment_for_type(p_course_id BIGINT,p_type TEXT)
RETURNS TABLE (
  enrollment_id BIGINT, participant_id BIGINT, participant_name TEXT,
  course_name TEXT, course_code TEXT, duration_hours INTEGER,
  final_grade NUMERIC, attendance_percent NUMERIC,
  academic_met BOOLEAN, attendance_met BOOLEAN,
  approval_status TEXT, blocked_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  sessions_table REGCLASS := COALESCE(to_regclass('public.sesiones'), to_regclass('public.sesiones_curso'));
  attendance_table REGCLASS := COALESCE(to_regclass('public.asistencias_participantes'), to_regclass('public.asistencias'));
BEGIN
  IF p_type NOT IN ('aprobacion','participacion') OR p_type IS NULL THEN
    RAISE EXCEPTION 'Unsupported certificate type' USING ERRCODE='P0400';
  END IF;
  IF sessions_table IS NULL OR attendance_table IS NULL THEN
    RAISE EXCEPTION 'Missing academic schema' USING ERRCODE='P0503';
  END IF;
  RETURN QUERY EXECUTE format($query$
    WITH session_totals AS (
      SELECT count(*) FILTER (WHERE s.fecha <= (now() AT TIME ZONE 'America/La_Paz')::date) AS completed,
        count(*) FILTER (WHERE s.fecha > (now() AT TIME ZONE 'America/La_Paz')::date) AS future
      FROM %s s WHERE s.curso_id=$1
    ), assessment AS (
      SELECT i.id::bigint AS enrollment_id, i.participante_id::bigint AS participant_id,
        COALESCE(NULLIF(to_jsonb(u)->>'nombre_completo',''),to_jsonb(u)->>'nombre') AS participant_name,
        c.nombre::text AS course_name, COALESCE(c.codigo,'')::text AS course_code,
        COALESCE(NULLIF((to_jsonb(c)->>'duracion_horas')::integer,0),(to_jsonb(c)->>'horas')::integer) AS duration_hours,
        CASE WHEN e.total>0 AND e.total=e.graded AND abs(e.weight-100)<0.000001
          AND st.completed>0 AND a.recorded=st.completed
          AND c.fecha_fin<(now() AT TIME ZONE 'America/La_Paz')::date AND st.future=0
          THEN round(e.weighted/e.weight,2) END AS final_grade,
        CASE WHEN st.completed>0 THEN round(100.0*a.present/st.completed,2) END AS attendance_percent,
        COALESCE((to_jsonb(c)->>'nota_minima')::numeric,(to_jsonb(c)->>'nota_minima_aprobacion')::numeric,70) AS minimum_grade,
        COALESCE((to_jsonb(c)->>'asistencia_minima')::numeric,80) AS minimum_attendance,
        (c.fecha_fin<(now() AT TIME ZONE 'America/La_Paz')::date AND st.future=0) AS finished,
        (st.completed>0 AND a.recorded=st.completed) AS attendance_complete,
        COALESCE(abs(e.weight-100)<0.000001,false) AS weight_complete
      FROM public.inscripciones i JOIN public.cursos c ON c.id=i.curso_id
      JOIN public.usuarios u ON u.id=i.participante_id CROSS JOIN session_totals st
      CROSS JOIN LATERAL (
        SELECT count(*) AS total, count(g.id) AS graded, sum(ev.ponderacion) AS weight,
          sum(g.nota*100.0/NULLIF(COALESCE((to_jsonb(ev)->>'puntaje_maximo')::numeric,100),0)*ev.ponderacion) AS weighted
        FROM public.evaluaciones ev LEFT JOIN public.calificaciones g ON g.evaluacion_id=ev.id AND g.inscripcion_id=i.id
        WHERE ev.curso_id=c.id
      ) e
      CROSS JOIN LATERAL (
        SELECT count(DISTINCT atn.sesion_id) AS recorded,
          count(DISTINCT atn.sesion_id) FILTER (WHERE atn.estado::text='presente') AS present
        FROM %s atn JOIN %s s ON s.id=atn.sesion_id
        WHERE atn.inscripcion_id=i.id AND s.curso_id=c.id
          AND s.fecha<=(now() AT TIME ZONE 'America/La_Paz')::date
      ) a
      WHERE i.curso_id=$1 AND i.estado::text='inscrito'
    )
    SELECT enrollment_id,participant_id,participant_name,course_name,course_code,duration_hours,
      final_grade,attendance_percent,
      COALESCE(final_grade>=minimum_grade,false),
      COALESCE(attendance_complete AND attendance_percent>=minimum_attendance,false),
      CASE WHEN NOT COALESCE(finished,false) OR NOT attendance_complete
          OR ($2='aprobacion' AND final_grade IS NULL) THEN 'PENDIENTE'
        WHEN ($2='participacion' OR final_grade>=minimum_grade) AND attendance_percent>=minimum_attendance
          THEN 'APROBADO' ELSE 'REPROBADO' END,
      CASE WHEN NOT COALESCE(finished,false) THEN 'El curso aún no ha finalizado o tiene sesiones futuras.'
        WHEN NOT attendance_complete THEN 'Faltan registros de asistencia de las sesiones realizadas.'
        WHEN $2='aprobacion' AND NOT weight_complete THEN 'La ponderación de las evaluaciones debe sumar el 100 %%.'
        WHEN $2='aprobacion' AND final_grade IS NULL THEN 'Hay evaluaciones o calificaciones pendientes.'
        WHEN $2='aprobacion' AND final_grade<minimum_grade THEN 'No cumple la nota mínima del curso.'
        WHEN attendance_percent<minimum_attendance THEN 'No cumple la asistencia mínima del curso.'
        WHEN duration_hours IS NULL OR duration_hours<=0 THEN 'Falta la duración del curso.'
        ELSE NULL END
    FROM assessment
  $query$,sessions_table,attendance_table,sessions_table) USING p_course_id,p_type;
END;
$$;

-- Retain the original API signatures, but route all approval checks to the same rules.
CREATE OR REPLACE FUNCTION public.certificate_assessment(p_course_id BIGINT)
RETURNS TABLE (
  enrollment_id BIGINT, participant_id BIGINT, participant_name TEXT,
  course_name TEXT, course_code TEXT, duration_hours INTEGER,
  final_grade NUMERIC, attendance_percent NUMERIC,
  academic_met BOOLEAN, attendance_met BOOLEAN,
  approval_status TEXT, blocked_reason TEXT
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT * FROM public.certificate_assessment_for_type(p_course_id,'aprobacion');
$$;

CREATE OR REPLACE FUNCTION public.emit_certificate_for_type(p_enrollment_id BIGINT,p_code TEXT,p_public_url TEXT,p_actor_id BIGINT,p_type TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  selected_course BIGINT; result_id BIGINT; result_state public.resultados_curso.estado%TYPE;
  assessment RECORD; saved public.certificados;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=p_actor_id
    AND u.rol::text='administrador' AND u.activo IS TRUE) THEN
    RAISE EXCEPTION 'Forbidden actor' USING ERRCODE='P0403';
  END IF;
  SELECT i.curso_id INTO selected_course FROM public.inscripciones i WHERE i.id=p_enrollment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment not found' USING ERRCODE='P0404'; END IF;
  PERFORM 1 FROM public.cursos WHERE id=selected_course FOR SHARE;
  PERFORM 1 FROM public.inscripciones WHERE id=p_enrollment_id AND curso_id=selected_course FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment changed' USING ERRCODE='P0404'; END IF;
  IF EXISTS (SELECT 1 FROM public.certificados ct JOIN public.resultados_curso r ON r.id=ct.resultado_curso_id
    WHERE r.inscripcion_id=p_enrollment_id) THEN
    RAISE EXCEPTION 'Already issued' USING ERRCODE='P0409';
  END IF;
  SELECT * INTO assessment FROM public.certificate_assessment_for_type(selected_course,p_type) a WHERE a.enrollment_id=p_enrollment_id;
  IF NOT FOUND OR assessment.approval_status<>'APROBADO' OR assessment.blocked_reason IS NOT NULL
    OR (p_type='aprobacion' AND NOT assessment.academic_met) OR NOT assessment.attendance_met THEN
    RAISE EXCEPTION 'Approval requirements not met' USING ERRCODE='P0400';
  END IF;
  IF assessment.final_grade IS NULL THEN result_state:='pendiente';
  ELSIF assessment.academic_met AND assessment.attendance_met THEN result_state:='aprobado';
  ELSE result_state:='reprobado'; END IF;
  INSERT INTO public.resultados_curso(inscripcion_id,nota_final,porcentaje_asistencia,cumple_nota,cumple_asistencia,estado,fecha_resultado)
    VALUES(p_enrollment_id,assessment.final_grade,assessment.attendance_percent,assessment.academic_met,assessment.attendance_met,result_state,now())
    ON CONFLICT(inscripcion_id) DO UPDATE SET nota_final=EXCLUDED.nota_final,porcentaje_asistencia=EXCLUDED.porcentaje_asistencia,
      cumple_nota=EXCLUDED.cumple_nota,cumple_asistencia=EXCLUDED.cumple_asistencia,estado=EXCLUDED.estado,fecha_resultado=now()
    RETURNING id INTO result_id;
  INSERT INTO public.certificados(resultado_curso_id,codigo_verificacion,tipo,url_verificacion,codigo_qr,datos_emision)
    VALUES(result_id,p_code,p_type::public.tipo_certificado,p_public_url,p_public_url,jsonb_build_object(
      'version',1,'participantName',assessment.participant_name,'courseName',assessment.course_name,'durationHours',assessment.duration_hours))
    RETURNING * INTO saved;
  RETURN to_jsonb(saved)||jsonb_build_object('id',saved.id::text,'anulaciones_certificados','[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.emit_certificate(p_enrollment_id BIGINT,p_code TEXT,p_public_url TEXT,p_actor_id BIGINT)
RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT public.emit_certificate_for_type(p_enrollment_id,p_code,p_public_url,p_actor_id,'aprobacion');
$$;

DO $permissions$
DECLARE signature TEXT; role_name TEXT;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.certificate_assessment_for_type(bigint,text)', 'public.certificate_assessment(bigint)',
    'public.emit_certificate_for_type(bigint,text,text,bigint,text)', 'public.emit_certificate(bigint,text,text,bigint)'
  ] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC',signature);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I',signature,role_name);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',signature);
    END IF;
  END LOOP;
END $permissions$;
NOTIFY pgrst,'reload schema';
