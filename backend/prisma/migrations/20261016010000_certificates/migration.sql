-- Additive migration for the existing Supabase tables. Do not run historical
-- Prisma migrations or reset this database. Review/apply this file explicitly.
BEGIN;

ALTER TABLE public.certificados ADD COLUMN IF NOT EXISTS datos_emision JSONB;
-- Fail rather than fabricate historical certificate contents if old rows exist.
ALTER TABLE public.certificados ALTER COLUMN datos_emision SET NOT NULL;
ALTER TABLE public.certificados ADD CONSTRAINT certificados_codigo_hex_check
  CHECK (codigo_verificacion ~ '^[0-9A-F]{8}$');
ALTER TABLE public.certificados ADD CONSTRAINT certificados_snapshot_check CHECK ((
  jsonb_typeof(datos_emision) = 'object'
  AND datos_emision->>'version' = '1'
  AND length(datos_emision->>'participantName') > 0
  AND length(datos_emision->>'courseName') > 0
  AND (datos_emision->>'durationHours')::numeric > 0
) IS TRUE);
ALTER TABLE public.resultados_curso ADD CONSTRAINT resultados_curso_inscripcion_id_fkey
  FOREIGN KEY (inscripcion_id) REFERENCES public.inscripciones(id) ON DELETE RESTRICT;

-- One assessment shared by the administrator roster and atomic issuance.
-- Supports both table names found in the codebase and the existing Supabase
-- schema, without creating duplicate attendance/evaluation tables.
CREATE FUNCTION public.certificate_assessment(p_course_id BIGINT)
RETURNS TABLE (
  enrollment_id BIGINT, participant_id BIGINT, participant_name TEXT,
  course_name TEXT, course_code TEXT, duration_hours INTEGER,
  final_grade NUMERIC, attendance_percent NUMERIC,
  academic_met BOOLEAN, attendance_met BOOLEAN,
  approval_status TEXT, blocked_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  sessions_table REGCLASS := COALESCE(to_regclass('public.sesiones_curso'), to_regclass('public.sesiones'));
  attendance_table REGCLASS := COALESCE(to_regclass('public.asistencias'), to_regclass('public.asistencias_participantes'));
BEGIN
  IF sessions_table IS NULL OR attendance_table IS NULL THEN
    RAISE EXCEPTION 'Missing academic schema' USING ERRCODE = 'P0503';
  END IF;
  RETURN QUERY EXECUTE format($query$
    WITH session_totals AS (
      SELECT count(*) FILTER (WHERE s.fecha <= (now() AT TIME ZONE 'America/La_Paz')::date) AS completed,
        count(*) FILTER (WHERE s.fecha > (now() AT TIME ZONE 'America/La_Paz')::date) AS future
      FROM %s s WHERE s.curso_id = $1
    ), assessment AS (
      SELECT i.id::bigint AS enrollment_id, i.participante_id::bigint AS participant_id,
        COALESCE(NULLIF(to_jsonb(u)->>'nombre_completo',''), to_jsonb(u)->>'nombre') AS participant_name,
        c.nombre::text AS course_name, COALESCE(c.codigo,'')::text AS course_code,
        COALESCE(NULLIF((to_jsonb(c)->>'duracion_horas')::integer,0), (to_jsonb(c)->>'horas')::integer) AS duration_hours,
        CASE WHEN e.total > 0 AND e.total = e.graded AND e.weight > 0
          THEN round(e.weighted / e.weight, 2) END AS final_grade,
        CASE WHEN st.completed > 0 THEN round(100.0 * a.present / st.completed, 2) END AS attendance_percent,
        COALESCE((to_jsonb(c)->>'nota_minima')::numeric, (to_jsonb(c)->>'nota_minima_aprobacion')::numeric,70) AS minimum_grade,
        COALESCE((to_jsonb(c)->>'asistencia_minima')::numeric,80) AS minimum_attendance,
        (c.fecha_fin < (now() AT TIME ZONE 'America/La_Paz')::date AND st.future = 0) AS finished
      FROM public.inscripciones i JOIN public.cursos c ON c.id = i.curso_id
      JOIN public.usuarios u ON u.id = i.participante_id CROSS JOIN session_totals st
      CROSS JOIN LATERAL (
        SELECT count(*) AS total, count(g.id) AS graded, sum(ev.ponderacion) AS weight,
          sum(g.nota * 100.0 / NULLIF(COALESCE((to_jsonb(ev)->>'puntaje_maximo')::numeric,100),0) * ev.ponderacion) AS weighted
        FROM public.evaluaciones ev LEFT JOIN public.calificaciones g
          ON g.evaluacion_id = ev.id AND g.inscripcion_id = i.id
        WHERE ev.curso_id = c.id
      ) e
      CROSS JOIN LATERAL (
        SELECT count(DISTINCT atn.sesion_id) AS present FROM %s atn JOIN %s s ON s.id = atn.sesion_id
        WHERE atn.inscripcion_id = i.id AND s.curso_id = c.id
          AND s.fecha <= (now() AT TIME ZONE 'America/La_Paz')::date AND atn.estado::text = 'presente'
      ) a
      WHERE i.curso_id = $1 AND i.estado::text = 'inscrito'
    )
    SELECT enrollment_id, participant_id, participant_name, course_name, course_code, duration_hours,
      final_grade, attendance_percent,
      COALESCE(final_grade >= minimum_grade,false), COALESCE(attendance_percent >= minimum_attendance,false),
      CASE WHEN NOT COALESCE(finished,false) OR final_grade IS NULL OR attendance_percent IS NULL THEN 'PENDIENTE'
        WHEN final_grade >= minimum_grade AND attendance_percent >= minimum_attendance THEN 'APROBADO' ELSE 'REPROBADO' END,
      CASE WHEN NOT COALESCE(finished,false) THEN 'El curso aún no ha finalizado o tiene sesiones futuras.'
        WHEN final_grade IS NULL THEN 'Hay evaluaciones o calificaciones pendientes.'
        WHEN attendance_percent IS NULL THEN 'El curso no tiene sesiones realizadas.'
        WHEN final_grade < minimum_grade THEN 'No cumple la nota mínima del curso.'
        WHEN attendance_percent < minimum_attendance THEN 'No cumple la asistencia mínima del curso.'
        WHEN duration_hours IS NULL OR duration_hours <= 0 THEN 'Falta la duración del curso.'
        ELSE NULL END
    FROM assessment
  $query$, sessions_table, attendance_table, sessions_table) USING p_course_id;
END;
$$;

CREATE FUNCTION public.certificate_candidates(p_course_id BIGINT) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('course', jsonb_build_object('id',c.id::text,'name',c.nombre,'code',COALESCE(c.codigo,'')),
    'students', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'enrollmentId',a.enrollment_id::text,'name',a.participant_name,'approvalStatus',a.approval_status,
        'blockedReason',CASE WHEN ct.id IS NOT NULL THEN 'El certificado ya fue emitido.' ELSE a.blocked_reason END,
        'certificate',CASE WHEN ct.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id',ct.id::text,'code',ct.codigo_verificacion,'status',
          CASE WHEN ct.estado::text = 'anulado' OR EXISTS (SELECT 1 FROM public.anulaciones_certificados ac WHERE ac.certificado_id=ct.id)
            THEN 'REVOKED' ELSE 'VALID' END) END
      ) ORDER BY a.participant_name,a.enrollment_id)
      FROM public.certificate_assessment(c.id) a
      LEFT JOIN public.resultados_curso r ON r.inscripcion_id=a.enrollment_id
      LEFT JOIN public.certificados ct ON ct.resultado_curso_id=r.id
    ),'[]'::jsonb))
  FROM public.cursos c WHERE c.id=p_course_id;
$$;

CREATE FUNCTION public.emit_certificate(p_enrollment_id BIGINT,p_code TEXT,p_public_url TEXT,p_actor_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  selected_course BIGINT;
  result_id BIGINT;
  assessment RECORD;
  saved public.certificados;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=p_actor_id AND u.rol::text='administrador'
    AND COALESCE((to_jsonb(u)->>'activo')::boolean,true)) THEN
    RAISE EXCEPTION 'Forbidden actor' USING ERRCODE='P0403';
  END IF;
  SELECT i.curso_id INTO selected_course FROM public.inscripciones i WHERE i.id=p_enrollment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment not found' USING ERRCODE='P0404'; END IF;
  -- Consistent lock order with the existing attendance module: course, enrollment.
  PERFORM 1 FROM public.cursos WHERE id=selected_course FOR SHARE;
  PERFORM 1 FROM public.inscripciones WHERE id=p_enrollment_id AND curso_id=selected_course FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment changed' USING ERRCODE='P0404'; END IF;
  IF EXISTS (SELECT 1 FROM public.certificados ct JOIN public.resultados_curso r ON r.id=ct.resultado_curso_id
    WHERE r.inscripcion_id=p_enrollment_id) THEN
    RAISE EXCEPTION 'Already issued' USING ERRCODE='P0409';
  END IF;
  SELECT * INTO assessment FROM public.certificate_assessment(selected_course) a WHERE a.enrollment_id=p_enrollment_id;
  IF NOT FOUND OR assessment.approval_status <> 'APROBADO' OR assessment.blocked_reason IS NOT NULL
    OR NOT assessment.academic_met OR NOT assessment.attendance_met THEN
    RAISE EXCEPTION 'Approval requirements not met' USING ERRCODE='P0400';
  END IF;
  INSERT INTO public.resultados_curso(inscripcion_id,nota_final,porcentaje_asistencia,cumple_nota,cumple_asistencia,estado,fecha_resultado)
    VALUES(p_enrollment_id,assessment.final_grade,assessment.attendance_percent,true,true,'aprobado',now())
    ON CONFLICT(inscripcion_id) DO UPDATE SET nota_final=EXCLUDED.nota_final,
      porcentaje_asistencia=EXCLUDED.porcentaje_asistencia,cumple_nota=true,cumple_asistencia=true,estado='aprobado',fecha_resultado=now()
    RETURNING id INTO result_id;
  INSERT INTO public.certificados(resultado_curso_id,codigo_verificacion,tipo,url_verificacion,codigo_qr,datos_emision)
    VALUES(result_id,p_code,'aprobacion',p_public_url,p_public_url,jsonb_build_object(
      'version',1,'participantName',assessment.participant_name,'courseName',assessment.course_name,'durationHours',assessment.duration_hours))
    RETURNING * INTO saved;
  -- bigint ID is text in the JSON result; never round it through a JS number.
  RETURN to_jsonb(saved) || jsonb_build_object('id',saved.id::text,'anulaciones_certificados','[]'::jsonb);
END;
$$;

ALTER TABLE public.certificados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resultados_curso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anulaciones_certificados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION public.certificate_assessment(BIGINT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.certificate_candidates(BIGINT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emit_certificate(BIGINT,TEXT,TEXT,BIGINT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.certificate_assessment(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.certificate_candidates(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.emit_certificate(BIGINT,TEXT,TEXT,BIGINT) TO service_role;
COMMIT;
