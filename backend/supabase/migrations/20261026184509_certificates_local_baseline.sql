-- Local initial schema only: refuse existing application data/schema.
DO $local_baseline$ BEGIN
 IF to_regclass('public.usuarios') IS NOT NULL OR to_regclass('public.cursos') IS NOT NULL THEN
 RAISE EXCEPTION 'Local baseline requires a new empty application schema'; END IF;
END $local_baseline$;
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: estado_asistencia; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_asistencia AS ENUM (
    'presente',
    'ausente'
);


--
-- Name: estado_certificado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_certificado AS ENUM (
    'valido',
    'anulado'
);


--
-- Name: estado_curso; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_curso AS ENUM (
    'borrador',
    'publicado'
);


--
-- Name: estado_inscripcion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_inscripcion AS ENUM (
    'preinscrito',
    'inscrito',
    'cancelado',
    'rechazado',
    'caducado'
);


--
-- Name: estado_preinscripcion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_preinscripcion AS ENUM (
    'pendiente',
    'confirmada',
    'cancelada'
);


--
-- Name: estado_resultado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_resultado AS ENUM (
    'pendiente',
    'aprobado',
    'reprobado'
);


--
-- Name: estado_resultado_curso; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_resultado_curso AS ENUM (
    'pendiente',
    'aprobado',
    'reprobado',
    'no_cumple_asistencia'
);


--
-- Name: grado_instructor; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.grado_instructor AS ENUM (
    'estudiante',
    'ingeniero',
    'tecnico'
);


--
-- Name: rol_usuario; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rol_usuario AS ENUM (
    'administrador',
    'participante',
    'instructor'
);


--
-- Name: tipo_certificado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_certificado AS ENUM (
    'aprobacion',
    'participacion'
);


--
-- Name: certificate_assessment(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.certificate_assessment(p_course_id bigint) RETURNS TABLE(enrollment_id bigint, participant_id bigint, participant_name text, course_name text, course_code text, duration_hours integer, final_grade numeric, attendance_percent numeric, academic_met boolean, attendance_met boolean, approval_status text, blocked_reason text)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT * FROM public.certificate_assessment_for_type(p_course_id,'aprobacion');
$$;


--
-- Name: certificate_assessment_for_type(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.certificate_assessment_for_type(p_course_id bigint, p_type text) RETURNS TABLE(enrollment_id bigint, participant_id bigint, participant_name text, course_name text, course_code text, duration_hours integer, final_grade numeric, attendance_percent numeric, academic_met boolean, attendance_met boolean, approval_status text, blocked_reason text)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $_$
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
$_$;


--
-- Name: certificate_candidates(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.certificate_candidates(p_course_id bigint) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT public.certificate_candidates_for_type(p_course_id,'aprobacion');
$$;


--
-- Name: certificate_candidates_for_type(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.certificate_candidates_for_type(p_course_id bigint, p_type text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: clean_certificate_display_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clean_certificate_display_name() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE demonstration BOOLEAN;
BEGIN
  SELECT c.es_demostracion INTO demonstration FROM public.resultados_curso r JOIN public.inscripciones i ON i.id=r.inscripcion_id
    JOIN public.cursos c ON c.id=i.curso_id WHERE r.id=NEW.resultado_curso_id;
  NEW.datos_emision:=jsonb_set(jsonb_set(NEW.datos_emision,'{courseName}',to_jsonb(public.clean_demo_display_name(NEW.datos_emision->>'courseName'))),
    '{participantName}',to_jsonb(replace(public.clean_demo_display_name(NEW.datos_emision->>'participantName'),'Participante de prueba ','Participante ')))
    || jsonb_build_object('demo',COALESCE(demonstration,false) OR COALESCE((NEW.datos_emision->>'demo')::boolean,false));
  RETURN NEW;
END $$;


--
-- Name: clean_course_display_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clean_course_display_name() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.es_demostracion:=NEW.es_demostracion OR NEW.nombre ILIKE '%DEMOSTRACION SIN VALIDEZ ACADEMICA%'
    OR COALESCE(NEW.codigo LIKE 'EVA-PRUEBA-%' OR NEW.codigo LIKE 'EVA-FLUJO-%',false);
  NEW.nombre:=public.clean_demo_display_name(NEW.nombre);
  NEW.instructor:=public.clean_demo_display_name(NEW.instructor);
  RETURN NEW;
END $$;


--
-- Name: clean_demo_display_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clean_demo_display_name(value text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO 'public', 'pg_temp'
    AS $_$
  SELECT trim(regexp_replace(
    regexp_replace(value,'^\[(PRUEBA( FLUJO)?|DEMO)\][[:space:]]*','','i'),
    '[[:space:]]*[-·]?[[:space:]]*DEMOSTRACION SIN VALIDEZ ACADEMICA[[:space:]]*$','','i'));
$_$;


--
-- Name: clean_user_display_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clean_user_display_name() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.nombre_completo:=replace(public.clean_demo_display_name(NEW.nombre_completo),'Participante de prueba ','Participante ');
  NEW.nombre:=replace(public.clean_demo_display_name(NEW.nombre),'Participante de prueba ','Participante ');
  RETURN NEW;
END $$;


--
-- Name: crear_usuario_desde_auth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_usuario_desde_auth() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  profile public.usuarios%ROWTYPE;
  category_id integer;
  confirmed_email text := lower(btrim(NEW.email));
BEGIN
  SELECT * INTO profile FROM public.usuarios WHERE auth_id = NEW.id;

  -- Provider-managed confirmation fields, never user-editable metadata.
  IF NEW.email_confirmed_at IS NULL OR confirmed_email IS NULL OR confirmed_email = '' THEN
    RETURN NEW;
  END IF;

  -- Preserve managed and historical accounts, including their assigned role.
  IF FOUND AND (NOT profile.registro_publico OR profile.rol::text <> 'participante') THEN
    RETURN NEW;
  END IF;
  IF profile.id IS NULL AND (
    NEW.raw_user_meta_data->>'registration_source' IS DISTINCT FROM 'eva-participant'
    OR NEW.confirmation_sent_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO STRICT category_id FROM public.tipos_participante
  WHERE nombre = CASE WHEN split_part(confirmed_email, '@', 2) IN ('est.umss.edu', 'ms.umss.edu')
    THEN 'Estudiante' ELSE 'Externo' END;

  IF profile.id IS NULL THEN
    IF length(btrim(COALESCE(NEW.raw_user_meta_data->>'nombre_completo', ''))) NOT BETWEEN 3 AND 150 THEN
      RAISE EXCEPTION 'Nombre de participante no válido';
    END IF;
    INSERT INTO public.usuarios(auth_id, nombre_completo, correo, rol, tipo_participante_id,
      registro_publico, correo_verificado_en)
    VALUES (NEW.id, btrim(NEW.raw_user_meta_data->>'nombre_completo'), confirmed_email,
      'participante', category_id, true, NEW.email_confirmed_at)
    ON CONFLICT (auth_id) DO NOTHING;
  ELSIF lower(profile.correo) IS DISTINCT FROM confirmed_email THEN
    -- A later, confirmed email change also updates eligibility for future
    -- enrollments. Prices already snapshotted in enrollments are untouched.
    UPDATE public.usuarios SET correo = confirmed_email, tipo_participante_id = category_id,
      correo_verificado_en = NEW.email_confirmed_at WHERE id = profile.id;
  END IF;
  -- Never adopt or rebind an existing profile by its email address.
  RETURN NEW;
END;
$$;


--
-- Name: emit_certificate(bigint, text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.emit_certificate(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT public.emit_certificate_for_type(p_enrollment_id,p_code,p_public_url,p_actor_id,'aprobacion');
$$;


--
-- Name: emit_certificate_for_type(bigint, text, text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.emit_certificate_for_type(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
END $$;


--
-- Name: emit_certificate_with_template(bigint, text, text, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.emit_certificate_with_template(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text, p_template_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE selected_template public.plantillas_certificados; result JSONB; saved public.certificados;
BEGIN
  SELECT * INTO selected_template FROM public.plantillas_certificados WHERE id=p_template_id AND tipo=p_type FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template unavailable for certificate type' USING ERRCODE='P0410'; END IF;
  result:=public.emit_certificate_for_type(p_enrollment_id,p_code,p_public_url,p_actor_id,p_type);
  UPDATE public.certificados SET datos_emision=datos_emision || jsonb_build_object('template',jsonb_build_object(
    'id',selected_template.id::text,'name',selected_template.nombre,'version',selected_template.version,'config',selected_template.config))
    WHERE id=(result->>'id')::bigint RETURNING * INTO saved;
  RETURN to_jsonb(saved) || jsonb_build_object('id',saved.id::text,'anulaciones_certificados','[]'::jsonb);
END $$;


--
-- Name: guard_certified_academic_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_certified_academic_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
END $$;


--
-- Name: preserve_issued_result(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_issued_result() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.certificados WHERE resultado_curso_id=OLD.id) THEN
    RAISE EXCEPTION 'Issued academic snapshots are immutable' USING ERRCODE='P0409'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;


--
-- Name: preserve_payment_movement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_payment_movement() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN RAISE EXCEPTION 'Payment history is append-only' USING ERRCODE='P0409'; END;
$$;


--
-- Name: reissue_certificate(bigint, text, text, bigint, text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reissue_certificate(p_certificate_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_reason text, p_type text, p_template_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
END $$;


--
-- Name: revoke_certificate(bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_certificate(p_certificate_id bigint, p_actor_id bigint, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
END $$;


--
-- Name: sync_attendance_course(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_attendance_course() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE selected_course BIGINT;
BEGIN
  SELECT curso_id INTO selected_course FROM public.sesiones WHERE id=NEW.sesion_id;
  IF NEW.curso_id IS NULL THEN NEW.curso_id:=selected_course; END IF;
  IF NEW.curso_id IS DISTINCT FROM selected_course THEN RAISE EXCEPTION 'Attendance course mismatch' USING ERRCODE='23514'; END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END $$;


--
-- Name: sync_session_api_time(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_session_api_time() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.hora_inicio_api IS NOT NULL THEN NEW.hora_inicio:=NEW.hora_inicio_api::time; END IF;
  ELSIF NEW.hora_inicio_api IS DISTINCT FROM OLD.hora_inicio_api THEN
    NEW.hora_inicio:=NEW.hora_inicio_api::time;
  END IF;
  NEW.hora_inicio_api:=to_char(NEW.hora_inicio,'HH24:MI');
  NEW.hora_fin:=NEW.hora_inicio + make_interval(mins=>NEW.duracion_minutos);
  NEW.updated_at:=now();
  RETURN NEW;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: anulaciones_certificados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anulaciones_certificados (
    id bigint NOT NULL,
    certificado_id bigint NOT NULL,
    motivo character varying(500) NOT NULL,
    anulado_por bigint NOT NULL,
    fecha_anulacion timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: anulaciones_certificados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.anulaciones_certificados ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.anulaciones_certificados_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: asignaciones_instructores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asignaciones_instructores (
    id integer NOT NULL,
    curso_id integer NOT NULL,
    instructor_id integer NOT NULL,
    asignado_por integer,
    fecha_asignacion timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: asignaciones_instructores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asignaciones_instructores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asignaciones_instructores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asignaciones_instructores_id_seq OWNED BY public.asignaciones_instructores.id;


--
-- Name: asistencias_instructores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asistencias_instructores (
    id bigint NOT NULL,
    sesion_id bigint NOT NULL,
    instructor_id bigint NOT NULL,
    estado public.estado_asistencia NOT NULL,
    observacion character varying(255),
    registrado_por bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    curso_id bigint NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asistencias_instructores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.asistencias_instructores ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.asistencias_instructores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: asistencias_participantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asistencias_participantes (
    id bigint NOT NULL,
    sesion_id bigint NOT NULL,
    inscripcion_id bigint NOT NULL,
    estado public.estado_asistencia NOT NULL,
    observacion character varying(255),
    registrado_por bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    curso_id bigint NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asistencias_participantes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.asistencias_participantes ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.asistencias_participantes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: becas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.becas (
    id bigint NOT NULL,
    usuario_id bigint NOT NULL,
    curso_id bigint NOT NULL,
    porcentaje numeric(5,2) NOT NULL,
    motivo character varying(255) NOT NULL,
    autorizado_por bigint NOT NULL,
    fecha_asignacion timestamp with time zone DEFAULT now() NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_beca_porcentaje CHECK (((porcentaje >= (0)::numeric) AND (porcentaje <= (100)::numeric)))
);


--
-- Name: becas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.becas ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.becas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: calificaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calificaciones (
    id bigint NOT NULL,
    evaluacion_id bigint NOT NULL,
    inscripcion_id bigint NOT NULL,
    nota numeric(5,2) NOT NULL,
    observacion character varying(255),
    registrado_por bigint NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    fecha_modificacion timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_calificacion_nota CHECK (((nota >= (0)::numeric) AND (nota <= (100)::numeric)))
);


--
-- Name: calificaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.calificaciones ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.calificaciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: certificados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certificados (
    id bigint NOT NULL,
    resultado_curso_id bigint NOT NULL,
    codigo_verificacion character varying(50) NOT NULL,
    tipo public.tipo_certificado DEFAULT 'aprobacion'::public.tipo_certificado NOT NULL,
    fecha_emision timestamp with time zone DEFAULT now() NOT NULL,
    url_pdf character varying(500),
    url_verificacion character varying(500) NOT NULL,
    codigo_qr character varying(500),
    emitido_fisico boolean DEFAULT false NOT NULL,
    emitido_digital boolean DEFAULT true NOT NULL,
    estado public.estado_certificado DEFAULT 'valido'::public.estado_certificado NOT NULL,
    datos_emision jsonb NOT NULL,
    inscripcion_id integer NOT NULL,
    reemplaza_certificado_id bigint,
    motivo_reemision text,
    CONSTRAINT certificados_codigo_hex_check CHECK (((codigo_verificacion)::text ~ '^[0-9A-F]{8}$'::text)),
    CONSTRAINT certificados_snapshot_check CHECK ((((jsonb_typeof(datos_emision) = 'object'::text) AND ((datos_emision ->> 'version'::text) = '1'::text) AND (length((datos_emision ->> 'participantName'::text)) > 0) AND (length((datos_emision ->> 'courseName'::text)) > 0) AND (((datos_emision ->> 'durationHours'::text))::numeric > (0)::numeric)) IS TRUE))
);


--
-- Name: certificados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.certificados ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.certificados_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cursos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cursos (
    id bigint NOT NULL,
    nombre character varying(200) NOT NULL,
    descripcion text,
    contenido text DEFAULT ''::text NOT NULL,
    horas integer,
    horario character varying(150) DEFAULT ''::character varying NOT NULL,
    instructor_id bigint,
    cupo_maximo integer,
    fecha_inicio date,
    fecha_fin date,
    fecha_inicio_preinscripcion date,
    fecha_fin_preinscripcion date,
    nota_minima numeric(5,2) DEFAULT 70 NOT NULL,
    asistencia_minima numeric(5,2) DEFAULT 80 NOT NULL,
    estado public.estado_curso DEFAULT 'borrador'::public.estado_curso NOT NULL,
    fecha_publicacion timestamp with time zone,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    codigo text,
    duracion_horas integer,
    instructor text,
    criterios_aprobacion text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    capacidad integer,
    minimo_inscritos integer DEFAULT 1 NOT NULL,
    es_demostracion boolean DEFAULT false NOT NULL,
    portada_url text,
    CONSTRAINT chk_curso_asistencia CHECK (((asistencia_minima >= (0)::numeric) AND (asistencia_minima <= (100)::numeric))),
    CONSTRAINT chk_curso_cupo CHECK ((cupo_maximo > 0)),
    CONSTRAINT chk_curso_fechas CHECK ((fecha_fin >= fecha_inicio)),
    CONSTRAINT chk_curso_horas CHECK ((horas > 0)),
    CONSTRAINT chk_curso_nota CHECK (((nota_minima >= (0)::numeric) AND (nota_minima <= (100)::numeric))),
    CONSTRAINT cursos_minimo_inscritos_check CHECK (((minimo_inscritos > 0) AND ((capacidad IS NULL) OR (minimo_inscritos <= capacidad))))
);


--
-- Name: cursos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cursos ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.cursos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: evaluaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluaciones (
    id bigint NOT NULL,
    curso_id bigint NOT NULL,
    nombre character varying(150) NOT NULL,
    descripcion text,
    ponderacion numeric(5,2) NOT NULL,
    fecha_evaluacion date,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    puntaje_maximo numeric(7,2) DEFAULT 100 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_evaluacion_ponderacion CHECK (((ponderacion > (0)::numeric) AND (ponderacion <= (100)::numeric)))
);


--
-- Name: evaluaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.evaluaciones ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.evaluaciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: historial_inscripciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historial_inscripciones (
    id integer NOT NULL,
    inscripcion_id integer NOT NULL,
    estado public.estado_inscripcion NOT NULL,
    motivo text NOT NULL,
    registrado_por bigint,
    registrado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: historial_inscripciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.historial_inscripciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historial_inscripciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.historial_inscripciones_id_seq OWNED BY public.historial_inscripciones.id;


--
-- Name: inscripciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inscripciones (
    id integer NOT NULL,
    curso_id integer NOT NULL,
    participante_id integer NOT NULL,
    tipo_participante_id integer NOT NULL,
    estado public.estado_inscripcion DEFAULT 'preinscrito'::public.estado_inscripcion NOT NULL,
    precio_base numeric(10,2) NOT NULL,
    porcentaje_beca numeric(5,2) DEFAULT 0 NOT NULL,
    beneficio numeric(10,2) DEFAULT 0 NOT NULL,
    monto_final numeric(10,2) NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    confirmada_en timestamp(3) without time zone,
    motivo_beca text,
    beca_activa boolean DEFAULT false NOT NULL,
    cerrada_en timestamp(3) without time zone,
    motivo_cierre text
);


--
-- Name: inscripciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inscripciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inscripciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inscripciones_id_seq OWNED BY public.inscripciones.id;


--
-- Name: movimientos_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimientos_pago (
    id integer NOT NULL,
    inscripcion_id integer NOT NULL,
    tipo character varying(12) NOT NULL,
    monto numeric(10,2) NOT NULL,
    motivo text NOT NULL,
    referencia character varying(100),
    solicitud_id uuid NOT NULL,
    registrado_por bigint,
    registrado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT movimientos_pago_check CHECK (((((tipo)::text = 'ABONO'::text) AND (monto > (0)::numeric)) OR (((tipo)::text = 'DEVOLUCION'::text) AND (monto < (0)::numeric)) OR (((tipo)::text = 'AJUSTE'::text) AND (monto <> (0)::numeric)) OR (((tipo)::text = 'APERTURA'::text) AND (monto >= (0)::numeric)))),
    CONSTRAINT movimientos_pago_motivo_check CHECK ((length(btrim(motivo)) >= 3)),
    CONSTRAINT movimientos_pago_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['APERTURA'::character varying, 'ABONO'::character varying, 'DEVOLUCION'::character varying, 'AJUSTE'::character varying])::text[])))
);


--
-- Name: movimientos_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimientos_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimientos_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimientos_pago_id_seq OWNED BY public.movimientos_pago.id;


--
-- Name: pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos (
    id integer NOT NULL,
    inscripcion_id integer NOT NULL,
    monto numeric(10,2) NOT NULL,
    registrado_en timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: pagos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pagos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pagos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pagos_id_seq OWNED BY public.pagos.id;


--
-- Name: plantillas_certificados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plantillas_certificados (
    id bigint NOT NULL,
    nombre text NOT NULL,
    tipo text NOT NULL,
    config jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    clave_inicial text,
    creado_por bigint,
    actualizado_por bigint,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plantillas_certificados_nombre_check CHECK (((length(nombre) >= 3) AND (length(nombre) <= 100))),
    CONSTRAINT plantillas_certificados_tipo_check CHECK ((tipo = ANY (ARRAY['aprobacion'::text, 'participacion'::text]))),
    CONSTRAINT plantillas_certificados_version_check CHECK ((version > 0))
);


--
-- Name: plantillas_certificados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plantillas_certificados_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plantillas_certificados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plantillas_certificados_id_seq OWNED BY public.plantillas_certificados.id;


--
-- Name: precios_curso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precios_curso (
    id integer NOT NULL,
    curso_id integer NOT NULL,
    tipo_participante_id integer NOT NULL,
    precio_base numeric(10,2) NOT NULL
);


--
-- Name: precios_curso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.precios_curso_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: precios_curso_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.precios_curso_id_seq OWNED BY public.precios_curso.id;


--
-- Name: preinscripciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preinscripciones (
    id bigint NOT NULL,
    usuario_id bigint NOT NULL,
    curso_id bigint NOT NULL,
    tipo_participante_id bigint NOT NULL,
    estado public.estado_preinscripcion DEFAULT 'pendiente'::public.estado_preinscripcion NOT NULL,
    fecha_preinscripcion timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: preinscripciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.preinscripciones ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.preinscripciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: resultados_academicos_curso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resultados_academicos_curso (
    id integer NOT NULL,
    curso_id integer NOT NULL,
    inscripcion_id integer NOT NULL,
    nota_final numeric(7,2),
    porcentaje_asistencia numeric(5,2),
    estado public.estado_resultado_curso DEFAULT 'pendiente'::public.estado_resultado_curso NOT NULL,
    registrado_por integer,
    fecha_calculo timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: resultados_academicos_curso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resultados_academicos_curso_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resultados_academicos_curso_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resultados_academicos_curso_id_seq OWNED BY public.resultados_academicos_curso.id;


--
-- Name: resultados_curso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resultados_curso (
    id bigint NOT NULL,
    inscripcion_id bigint NOT NULL,
    nota_final numeric(5,2),
    porcentaje_asistencia numeric(5,2) NOT NULL,
    cumple_nota boolean DEFAULT false NOT NULL,
    cumple_asistencia boolean DEFAULT false NOT NULL,
    estado public.estado_resultado DEFAULT 'pendiente'::public.estado_resultado NOT NULL,
    fecha_resultado timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_resultado_asistencia CHECK (((porcentaje_asistencia >= (0)::numeric) AND (porcentaje_asistencia <= (100)::numeric))),
    CONSTRAINT chk_resultado_nota CHECK (((nota_final >= (0)::numeric) AND (nota_final <= (100)::numeric)))
);


--
-- Name: resultados_curso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.resultados_curso ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.resultados_curso_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id bigint NOT NULL,
    nombre character varying(50) NOT NULL
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.roles ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sesiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sesiones (
    id bigint NOT NULL,
    curso_id bigint NOT NULL,
    numero_sesion integer NOT NULL,
    titulo character varying(150),
    descripcion text,
    fecha date NOT NULL,
    hora_inicio time without time zone NOT NULL,
    hora_fin time without time zone NOT NULL,
    duracion_minutos integer NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    hora_inicio_api character varying(5) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_sesion_duracion CHECK ((duracion_minutos > 0)),
    CONSTRAINT chk_sesion_horas CHECK ((hora_fin > hora_inicio))
);


--
-- Name: sesiones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sesiones ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.sesiones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tipos_participante; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_participante (
    id integer NOT NULL,
    nombre text NOT NULL
);


--
-- Name: tipos_participante_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tipos_participante_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipos_participante_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tipos_participante_id_seq OWNED BY public.tipos_participante.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id bigint NOT NULL,
    auth_id uuid NOT NULL,
    nombre_completo character varying(150) NOT NULL,
    correo character varying(150) NOT NULL,
    documento_identidad character varying(30),
    telefono character varying(30),
    activo boolean DEFAULT true NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    nombre text DEFAULT 'Usuario'::text,
    tipo_participante_id integer,
    rol public.rol_usuario DEFAULT 'participante'::public.rol_usuario,
    codigo_sis text,
    grado public.grado_instructor,
    registro_publico boolean DEFAULT false NOT NULL,
    correo_verificado_en timestamp with time zone
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.usuarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: usuarios_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios_roles (
    id bigint NOT NULL,
    usuario_id bigint NOT NULL,
    rol_id bigint NOT NULL,
    fecha_asignacion timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: usuarios_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.usuarios_roles ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.usuarios_roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: asignaciones_instructores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_instructores ALTER COLUMN id SET DEFAULT nextval('public.asignaciones_instructores_id_seq'::regclass);


--
-- Name: historial_inscripciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_inscripciones ALTER COLUMN id SET DEFAULT nextval('public.historial_inscripciones_id_seq'::regclass);


--
-- Name: inscripciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripciones ALTER COLUMN id SET DEFAULT nextval('public.inscripciones_id_seq'::regclass);


--
-- Name: movimientos_pago id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_pago ALTER COLUMN id SET DEFAULT nextval('public.movimientos_pago_id_seq'::regclass);


--
-- Name: pagos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos ALTER COLUMN id SET DEFAULT nextval('public.pagos_id_seq'::regclass);


--
-- Name: plantillas_certificados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantillas_certificados ALTER COLUMN id SET DEFAULT nextval('public.plantillas_certificados_id_seq'::regclass);


--
-- Name: precios_curso id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precios_curso ALTER COLUMN id SET DEFAULT nextval('public.precios_curso_id_seq'::regclass);


--
-- Name: resultados_academicos_curso id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados_academicos_curso ALTER COLUMN id SET DEFAULT nextval('public.resultados_academicos_curso_id_seq'::regclass);


--
-- Name: tipos_participante id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_participante ALTER COLUMN id SET DEFAULT nextval('public.tipos_participante_id_seq'::regclass);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: anulaciones_certificados anulaciones_certificados_certificado_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anulaciones_certificados
    ADD CONSTRAINT anulaciones_certificados_certificado_id_key UNIQUE (certificado_id);


--
-- Name: anulaciones_certificados anulaciones_certificados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anulaciones_certificados
    ADD CONSTRAINT anulaciones_certificados_pkey PRIMARY KEY (id);


--
-- Name: asignaciones_instructores asignaciones_instructores_curso_id_instructor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_instructores
    ADD CONSTRAINT asignaciones_instructores_curso_id_instructor_id_key UNIQUE (curso_id, instructor_id);


--
-- Name: asignaciones_instructores asignaciones_instructores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_instructores
    ADD CONSTRAINT asignaciones_instructores_pkey PRIMARY KEY (id);


--
-- Name: asistencias_instructores asistencias_instructores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias_instructores
    ADD CONSTRAINT asistencias_instructores_pkey PRIMARY KEY (id);


--
-- Name: asistencias_instructores asistencias_instructores_sesion_id_instructor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias_instructores
    ADD CONSTRAINT asistencias_instructores_sesion_id_instructor_id_key UNIQUE (sesion_id, instructor_id);


--
-- Name: asistencias_participantes asistencias_participantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias_participantes
    ADD CONSTRAINT asistencias_participantes_pkey PRIMARY KEY (id);


--
-- Name: asistencias_participantes asistencias_participantes_sesion_id_inscripcion_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias_participantes
    ADD CONSTRAINT asistencias_participantes_sesion_id_inscripcion_id_key UNIQUE (sesion_id, inscripcion_id);


--
-- Name: becas becas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.becas
    ADD CONSTRAINT becas_pkey PRIMARY KEY (id);


--
-- Name: becas becas_usuario_id_curso_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.becas
    ADD CONSTRAINT becas_usuario_id_curso_id_key UNIQUE (usuario_id, curso_id);


--
-- Name: calificaciones calificaciones_evaluacion_id_inscripcion_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calificaciones
    ADD CONSTRAINT calificaciones_evaluacion_id_inscripcion_id_key UNIQUE (evaluacion_id, inscripcion_id);


--
-- Name: calificaciones calificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calificaciones
    ADD CONSTRAINT calificaciones_pkey PRIMARY KEY (id);


--
-- Name: certificados certificados_codigo_verificacion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificados
    ADD CONSTRAINT certificados_codigo_verificacion_key UNIQUE (codigo_verificacion);


--
-- Name: certificados certificados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificados
    ADD CONSTRAINT certificados_pkey PRIMARY KEY (id);


--
-- Name: certificados certificados_resultado_curso_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificados
    ADD CONSTRAINT certificados_resultado_curso_id_key UNIQUE (resultado_curso_id);


--
-- Name: certificados certificados_url_verificacion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificados
    ADD CONSTRAINT certificados_url_verificacion_key UNIQUE (url_verificacion);


--
-- Name: cursos cursos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cursos
    ADD CONSTRAINT cursos_pkey PRIMARY KEY (id);


--
-- Name: evaluaciones evaluaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones
    ADD CONSTRAINT evaluaciones_pkey PRIMARY KEY (id);


--
-- Name: historial_inscripciones historial_inscripciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_inscripciones
    ADD CONSTRAINT historial_inscripciones_pkey PRIMARY KEY (id);


--
-- Name: inscripciones inscripciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripciones
    ADD CONSTRAINT inscripciones_pkey PRIMARY KEY (id);


--
-- Name: movimientos_pago movimientos_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_pago
    ADD CONSTRAINT movimientos_pago_pkey PRIMARY KEY (id);


--
-- Name: movimientos_pago movimientos_pago_solicitud_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_pago
    ADD CONSTRAINT movimientos_pago_solicitud_id_key UNIQUE (solicitud_id);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id);


--
-- Name: plantillas_certificados plantillas_certificados_clave_inicial_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantillas_certificados
    ADD CONSTRAINT plantillas_certificados_clave_inicial_key UNIQUE (clave_inicial);


--
-- Name: plantillas_certificados plantillas_certificados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantillas_certificados
    ADD CONSTRAINT plantillas_certificados_pkey PRIMARY KEY (id);


--
-- Name: precios_curso precios_curso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precios_curso
    ADD CONSTRAINT precios_curso_pkey PRIMARY KEY (id);


--
-- Name: preinscripciones preinscripciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preinscripciones
    ADD CONSTRAINT preinscripciones_pkey PRIMARY KEY (id);


--
-- Name: preinscripciones preinscripciones_usuario_id_curso_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preinscripciones
    ADD CONSTRAINT preinscripciones_usuario_id_curso_id_key UNIQUE (usuario_id, curso_id);


--
-- Name: resultados_academicos_curso resultados_academicos_curso_inscripcion_id_curso_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados_academicos_curso
    ADD CONSTRAINT resultados_academicos_curso_inscripcion_id_curso_id_key UNIQUE (inscripcion_id, curso_id);


--
-- Name: resultados_academicos_curso resultados_academicos_curso_inscripcion_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados_academicos_curso
    ADD CONSTRAINT resultados_academicos_curso_inscripcion_id_key UNIQUE (inscripcion_id);


--
-- Name: resultados_academicos_curso resultados_academicos_curso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados_academicos_curso
    ADD CONSTRAINT resultados_academicos_curso_pkey PRIMARY KEY (id);


--
-- Name: resultados_curso resultados_curso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados_curso
    ADD CONSTRAINT resultados_curso_pkey PRIMARY KEY (id);


--
-- Name: roles roles_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_nombre_key UNIQUE (nombre);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sesiones sesiones_curso_id_numero_sesion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT sesiones_curso_id_numero_sesion_key UNIQUE (curso_id, numero_sesion);


--
-- Name: sesiones sesiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT sesiones_pkey PRIMARY KEY (id);


--
-- Name: tipos_participante tipos_participante_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_participante
    ADD CONSTRAINT tipos_participante_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_auth_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_auth_id_key UNIQUE (auth_id);


--
-- Name: usuarios usuarios_correo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_correo_key UNIQUE (correo);


--
-- Name: usuarios usuarios_documento_identidad_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_documento_identidad_key UNIQUE (documento_identidad);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: usuarios_roles usuarios_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_pkey PRIMARY KEY (id);


--
-- Name: usuarios_roles usuarios_roles_usuario_id_rol_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_usuario_id_rol_id_key UNIQUE (usuario_id, rol_id);


--
-- Name: asignaciones_instructores_instructor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asignaciones_instructores_instructor_id_idx ON public.asignaciones_instructores USING btree (instructor_id);


--
-- Name: certificados_inscripcion_vigente_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX certificados_inscripcion_vigente_key ON public.certificados USING btree (inscripcion_id) WHERE (estado = 'valido'::public.estado_certificado);


--
-- Name: certificados_reemplazo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX certificados_reemplazo_key ON public.certificados USING btree (reemplaza_certificado_id) WHERE (reemplaza_certificado_id IS NOT NULL);


--
-- Name: cursos_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cursos_codigo_key ON public.cursos USING btree (codigo);


--
-- Name: evaluaciones_curso_nombre_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX evaluaciones_curso_nombre_key ON public.evaluaciones USING btree (curso_id, nombre);


--
-- Name: historial_inscripciones_inscripcion_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX historial_inscripciones_inscripcion_fecha ON public.historial_inscripciones USING btree (inscripcion_id, registrado_en);


--
-- Name: inscripciones_curso_id_participante_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inscripciones_curso_id_participante_id_key ON public.inscripciones USING btree (curso_id, participante_id);


--
-- Name: inscripciones_id_curso_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inscripciones_id_curso_id_key ON public.inscripciones USING btree (id, curso_id);


--
-- Name: movimientos_pago_inscripcion_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX movimientos_pago_inscripcion_fecha ON public.movimientos_pago USING btree (inscripcion_id, registrado_en);


--
-- Name: pagos_inscripcion_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pagos_inscripcion_id_key ON public.pagos USING btree (inscripcion_id);


--
-- Name: precios_curso_curso_id_tipo_participante_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX precios_curso_curso_id_tipo_participante_id_key ON public.precios_curso USING btree (curso_id, tipo_participante_id);


--
-- Name: resultados_academicos_curso_curso_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resultados_academicos_curso_curso_id_idx ON public.resultados_academicos_curso USING btree (curso_id);


--
-- Name: sesiones_curso_fecha_inicio_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sesiones_curso_fecha_inicio_key ON public.sesiones USING btree (curso_id, fecha, hora_inicio_api);


--
-- Name: sesiones_id_curso_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sesiones_id_curso_id_key ON public.sesiones USING btree (id, curso_id);


--
-- Name: tipos_participante_nombre_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tipos_participante_nombre_key ON public.tipos_participante USING btree (nombre);


--
-- Name: usuarios_codigo_sis_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_codigo_sis_key ON public.usuarios USING btree (codigo_sis);


--
-- Name: asistencias_instructores asistencias_instructores_course; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER asistencias_instructores_course BEFORE INSERT OR UPDATE ON public.asistencias_instructores FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_course();


--
-- Name: asistencias_participantes asistencias_participantes_course; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER asistencias_participantes_course BEFORE INSERT OR UPDATE ON public.asistencias_participantes FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_course();


--
-- Name: certificados certificados_display_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER certificados_display_name BEFORE INSERT OR UPDATE OF datos_emision ON public.certificados FOR EACH ROW EXECUTE FUNCTION public.clean_certificate_display_name();


--
-- Name: cursos cursos_display_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cursos_display_name BEFORE INSERT OR UPDATE OF nombre, codigo, instructor, es_demostracion ON public.cursos FOR EACH ROW EXECUTE FUNCTION public.clean_course_display_name();


--
-- Name: asistencias_participantes guard_certified_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_certified_changes BEFORE INSERT OR DELETE OR UPDATE ON public.asistencias_participantes FOR EACH ROW EXECUTE FUNCTION public.guard_certified_academic_change();


--
-- Name: calificaciones guard_certified_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_certified_changes BEFORE INSERT OR DELETE OR UPDATE ON public.calificaciones FOR EACH ROW EXECUTE FUNCTION public.guard_certified_academic_change();


--
-- Name: evaluaciones guard_certified_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_certified_changes BEFORE INSERT OR DELETE OR UPDATE ON public.evaluaciones FOR EACH ROW EXECUTE FUNCTION public.guard_certified_academic_change();


--
-- Name: sesiones guard_certified_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_certified_changes BEFORE INSERT OR DELETE OR UPDATE ON public.sesiones FOR EACH ROW EXECUTE FUNCTION public.guard_certified_academic_change();


--
-- Name: cursos guard_certified_course_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_certified_course_changes BEFORE UPDATE OF fecha_fin, fecha_inicio, nota_minima, asistencia_minima, duracion_horas ON public.cursos FOR EACH ROW EXECUTE FUNCTION public.guard_certified_academic_change();


--
-- Name: resultados_curso preserve_issued_result; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER preserve_issued_result BEFORE DELETE OR UPDATE ON public.resultados_curso FOR EACH ROW EXECUTE FUNCTION public.preserve_issued_result();


--
-- Name: movimientos_pago preserve_payment_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER preserve_payment_history BEFORE DELETE OR UPDATE ON public.movimientos_pago FOR EACH ROW EXECUTE FUNCTION public.preserve_payment_movement();


--
-- Name: sesiones sesiones_api_time; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sesiones_api_time BEFORE INSERT OR UPDATE ON public.sesiones FOR EACH ROW EXECUTE FUNCTION public.sync_session_api_time();


--
-- Name: usuarios usuarios_display_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER usuarios_display_name BEFORE INSERT OR UPDATE OF nombre_completo, nombre ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.clean_user_display_name();


--
-- Name: anulaciones_certificados anulaciones_certificados_anulado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anulaciones_certificados
    ADD CONSTRAINT anulaciones_certificados_anulado_por_fkey FOREIGN KEY (anulado_por) REFERENCES public.usuarios(id);


--
-- Name: anulaciones_certificados anulaciones_certificados_certificado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anulaciones_certificados
    ADD CONSTRAINT anulaciones_certificados_certificado_id_fkey FOREIGN KEY (certificado_id) REFERENCES public.certificados(id);


--
-- Name: asignaciones_instructores asignaciones_instructores_asignado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_instructores
    ADD CONSTRAINT asignaciones_instructores_asignado_por_fkey FOREIGN KEY (asignado_por) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: asignaciones_instructores asignaciones_instructores_curso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_instructores
    ADD CONSTRAINT asignaciones_instructores_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES public.cursos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: asignaciones_instructores asignaciones_instructores_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_instructores
    ADD CONSTRAINT asignaciones_instructores_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: asistencias_instructores asistencias_instructores_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias_instructores
    ADD CONSTRAINT asistencias_instructores_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.usuarios(id);


--
-- Name: asistencias_instructores asistencias_instructores_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias_instructores
    ADD CONSTRAINT asistencias_instructores_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id);


--
-- Name: asistencias_instructores asistencias_instructores_sesion_curso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias_instructores
    ADD CONSTRAINT asistencias_instructores_sesion_curso_fkey FOREIGN KEY (sesion_id, curso_id) REFERENCES public.sesiones(id, curso_id);


--
-- Name: asistencias_instructores asistencias_instructores_sesion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias_instructores
    ADD CONSTRAINT asistencias_instructores_sesion_id_fkey FOREIGN KEY (sesion_id) REFERENCES public.sesiones(id) ON DELETE CASCADE;


--
-- Name: asistencias_participantes asistencias_participantes_inscripcion_curso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias_participantes
    ADD CONSTRAINT asistencias_participantes_inscripcion_curso_fkey FOREIGN KEY (inscripcion_id, curso_id) REFERENCES public.inscripciones(id, curso_id);


--
-- Name: asistencias_participantes asistencias_participantes_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias_participantes
    ADD CONSTRAINT asistencias_participantes_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id);


--
-- Name: asistencias_participantes asistencias_participantes_sesion_curso_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias_participantes
    ADD CONSTRAINT asistencias_participantes_sesion_curso_fkey FOREIGN KEY (sesion_id, curso_id) REFERENCES public.sesiones(id, curso_id);


--
-- Name: asistencias_participantes asistencias_participantes_sesion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias_participantes
    ADD CONSTRAINT asistencias_participantes_sesion_id_fkey FOREIGN KEY (sesion_id) REFERENCES public.sesiones(id) ON DELETE CASCADE;


--
-- Name: becas becas_autorizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.becas
    ADD CONSTRAINT becas_autorizado_por_fkey FOREIGN KEY (autorizado_por) REFERENCES public.usuarios(id);


--
-- Name: becas becas_curso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.becas
    ADD CONSTRAINT becas_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES public.cursos(id);


--
-- Name: becas becas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.becas
    ADD CONSTRAINT becas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: calificaciones calificaciones_evaluacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calificaciones
    ADD CONSTRAINT calificaciones_evaluacion_id_fkey FOREIGN KEY (evaluacion_id) REFERENCES public.evaluaciones(id) ON DELETE CASCADE;


--
-- Name: calificaciones calificaciones_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calificaciones
    ADD CONSTRAINT calificaciones_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id);


--
-- Name: certificados certificados_inscripcion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificados
    ADD CONSTRAINT certificados_inscripcion_id_fkey FOREIGN KEY (inscripcion_id) REFERENCES public.inscripciones(id) ON DELETE RESTRICT;


--
-- Name: certificados certificados_reemplaza_certificado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificados
    ADD CONSTRAINT certificados_reemplaza_certificado_id_fkey FOREIGN KEY (reemplaza_certificado_id) REFERENCES public.certificados(id) ON DELETE RESTRICT;


--
-- Name: certificados certificados_resultado_curso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificados
    ADD CONSTRAINT certificados_resultado_curso_id_fkey FOREIGN KEY (resultado_curso_id) REFERENCES public.resultados_curso(id) ON DELETE CASCADE;


--
-- Name: cursos cursos_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cursos
    ADD CONSTRAINT cursos_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.usuarios(id);


--
-- Name: evaluaciones evaluaciones_curso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones
    ADD CONSTRAINT evaluaciones_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES public.cursos(id) ON DELETE CASCADE;


--
-- Name: historial_inscripciones historial_inscripciones_inscripcion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_inscripciones
    ADD CONSTRAINT historial_inscripciones_inscripcion_id_fkey FOREIGN KEY (inscripcion_id) REFERENCES public.inscripciones(id) ON DELETE RESTRICT;


--
-- Name: historial_inscripciones historial_inscripciones_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_inscripciones
    ADD CONSTRAINT historial_inscripciones_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: inscripciones inscripciones_curso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripciones
    ADD CONSTRAINT inscripciones_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES public.cursos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: inscripciones inscripciones_participante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripciones
    ADD CONSTRAINT inscripciones_participante_id_fkey FOREIGN KEY (participante_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inscripciones inscripciones_tipo_participante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inscripciones
    ADD CONSTRAINT inscripciones_tipo_participante_id_fkey FOREIGN KEY (tipo_participante_id) REFERENCES public.tipos_participante(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: movimientos_pago movimientos_pago_inscripcion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_pago
    ADD CONSTRAINT movimientos_pago_inscripcion_id_fkey FOREIGN KEY (inscripcion_id) REFERENCES public.inscripciones(id) ON DELETE RESTRICT;


--
-- Name: movimientos_pago movimientos_pago_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_pago
    ADD CONSTRAINT movimientos_pago_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: pagos pagos_inscripcion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_inscripcion_id_fkey FOREIGN KEY (inscripcion_id) REFERENCES public.inscripciones(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: plantillas_certificados plantillas_certificados_actualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantillas_certificados
    ADD CONSTRAINT plantillas_certificados_actualizado_por_fkey FOREIGN KEY (actualizado_por) REFERENCES public.usuarios(id);


--
-- Name: plantillas_certificados plantillas_certificados_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantillas_certificados
    ADD CONSTRAINT plantillas_certificados_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: precios_curso precios_curso_curso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precios_curso
    ADD CONSTRAINT precios_curso_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES public.cursos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: precios_curso precios_curso_tipo_participante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precios_curso
    ADD CONSTRAINT precios_curso_tipo_participante_id_fkey FOREIGN KEY (tipo_participante_id) REFERENCES public.tipos_participante(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: preinscripciones preinscripciones_curso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preinscripciones
    ADD CONSTRAINT preinscripciones_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES public.cursos(id) ON DELETE CASCADE;


--
-- Name: preinscripciones preinscripciones_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preinscripciones
    ADD CONSTRAINT preinscripciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: resultados_academicos_curso resultados_academicos_curso_curso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados_academicos_curso
    ADD CONSTRAINT resultados_academicos_curso_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES public.cursos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: resultados_academicos_curso resultados_academicos_curso_inscripcion_id_curso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados_academicos_curso
    ADD CONSTRAINT resultados_academicos_curso_inscripcion_id_curso_id_fkey FOREIGN KEY (inscripcion_id, curso_id) REFERENCES public.inscripciones(id, curso_id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: resultados_academicos_curso resultados_academicos_curso_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados_academicos_curso
    ADD CONSTRAINT resultados_academicos_curso_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: resultados_curso resultados_curso_inscripcion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados_curso
    ADD CONSTRAINT resultados_curso_inscripcion_id_fkey FOREIGN KEY (inscripcion_id) REFERENCES public.inscripciones(id) ON DELETE RESTRICT;


--
-- Name: sesiones sesiones_curso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT sesiones_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES public.cursos(id) ON DELETE CASCADE;


--
-- Name: usuarios_roles usuarios_roles_rol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles(id);


--
-- Name: usuarios_roles usuarios_roles_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: usuarios usuarios_tipo_participante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_tipo_participante_id_fkey FOREIGN KEY (tipo_participante_id) REFERENCES public.tipos_participante(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: anulaciones_certificados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.anulaciones_certificados ENABLE ROW LEVEL SECURITY;

--
-- Name: asignaciones_instructores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asignaciones_instructores ENABLE ROW LEVEL SECURITY;

--
-- Name: asistencias_instructores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asistencias_instructores ENABLE ROW LEVEL SECURITY;

--
-- Name: asistencias_participantes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asistencias_participantes ENABLE ROW LEVEL SECURITY;

--
-- Name: becas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.becas ENABLE ROW LEVEL SECURITY;

--
-- Name: calificaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calificaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: certificados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.certificados ENABLE ROW LEVEL SECURITY;

--
-- Name: cursos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;

--
-- Name: evaluaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evaluaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: historial_inscripciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.historial_inscripciones ENABLE ROW LEVEL SECURITY;

--
-- Name: inscripciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inscripciones ENABLE ROW LEVEL SECURITY;

--
-- Name: movimientos_pago; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.movimientos_pago ENABLE ROW LEVEL SECURITY;

--
-- Name: pagos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

--
-- Name: plantillas_certificados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plantillas_certificados ENABLE ROW LEVEL SECURITY;

--
-- Name: precios_curso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.precios_curso ENABLE ROW LEVEL SECURITY;

--
-- Name: preinscripciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preinscripciones ENABLE ROW LEVEL SECURITY;

--
-- Name: resultados_academicos_curso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resultados_academicos_curso ENABLE ROW LEVEL SECURITY;

--
-- Name: resultados_curso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resultados_curso ENABLE ROW LEVEL SECURITY;

--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: sesiones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sesiones ENABLE ROW LEVEL SECURITY;

--
-- Name: tipos_participante; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipos_participante ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION certificate_assessment(p_course_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.certificate_assessment(p_course_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.certificate_assessment(p_course_id bigint) TO service_role;


--
-- Name: FUNCTION certificate_assessment_for_type(p_course_id bigint, p_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.certificate_assessment_for_type(p_course_id bigint, p_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.certificate_assessment_for_type(p_course_id bigint, p_type text) TO service_role;


--
-- Name: FUNCTION certificate_candidates(p_course_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.certificate_candidates(p_course_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.certificate_candidates(p_course_id bigint) TO service_role;


--
-- Name: FUNCTION certificate_candidates_for_type(p_course_id bigint, p_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.certificate_candidates_for_type(p_course_id bigint, p_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.certificate_candidates_for_type(p_course_id bigint, p_type text) TO service_role;


--
-- Name: FUNCTION clean_certificate_display_name(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clean_certificate_display_name() TO anon;
GRANT ALL ON FUNCTION public.clean_certificate_display_name() TO authenticated;
GRANT ALL ON FUNCTION public.clean_certificate_display_name() TO service_role;


--
-- Name: FUNCTION clean_course_display_name(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clean_course_display_name() TO anon;
GRANT ALL ON FUNCTION public.clean_course_display_name() TO authenticated;
GRANT ALL ON FUNCTION public.clean_course_display_name() TO service_role;


--
-- Name: FUNCTION clean_demo_display_name(value text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clean_demo_display_name(value text) TO anon;
GRANT ALL ON FUNCTION public.clean_demo_display_name(value text) TO authenticated;
GRANT ALL ON FUNCTION public.clean_demo_display_name(value text) TO service_role;


--
-- Name: FUNCTION clean_user_display_name(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clean_user_display_name() TO anon;
GRANT ALL ON FUNCTION public.clean_user_display_name() TO authenticated;
GRANT ALL ON FUNCTION public.clean_user_display_name() TO service_role;


--
-- Name: FUNCTION crear_usuario_desde_auth(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.crear_usuario_desde_auth() FROM PUBLIC;
GRANT ALL ON FUNCTION public.crear_usuario_desde_auth() TO anon;
GRANT ALL ON FUNCTION public.crear_usuario_desde_auth() TO authenticated;
GRANT ALL ON FUNCTION public.crear_usuario_desde_auth() TO service_role;


--
-- Name: FUNCTION emit_certificate(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.emit_certificate(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.emit_certificate(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint) TO service_role;


--
-- Name: FUNCTION emit_certificate_for_type(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.emit_certificate_for_type(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.emit_certificate_for_type(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text) TO service_role;


--
-- Name: FUNCTION emit_certificate_with_template(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text, p_template_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.emit_certificate_with_template(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text, p_template_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.emit_certificate_with_template(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text, p_template_id bigint) TO service_role;


--
-- Name: FUNCTION guard_certified_academic_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guard_certified_academic_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_certified_academic_change() TO service_role;


--
-- Name: FUNCTION preserve_issued_result(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.preserve_issued_result() FROM PUBLIC;
GRANT ALL ON FUNCTION public.preserve_issued_result() TO service_role;


--
-- Name: FUNCTION preserve_payment_movement(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.preserve_payment_movement() TO anon;
GRANT ALL ON FUNCTION public.preserve_payment_movement() TO authenticated;
GRANT ALL ON FUNCTION public.preserve_payment_movement() TO service_role;


--
-- Name: FUNCTION reissue_certificate(p_certificate_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_reason text, p_type text, p_template_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reissue_certificate(p_certificate_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_reason text, p_type text, p_template_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reissue_certificate(p_certificate_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_reason text, p_type text, p_template_id bigint) TO service_role;


--
-- Name: FUNCTION revoke_certificate(p_certificate_id bigint, p_actor_id bigint, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revoke_certificate(p_certificate_id bigint, p_actor_id bigint, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_certificate(p_certificate_id bigint, p_actor_id bigint, p_reason text) TO service_role;


--
-- Name: FUNCTION sync_attendance_course(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_attendance_course() TO anon;
GRANT ALL ON FUNCTION public.sync_attendance_course() TO authenticated;
GRANT ALL ON FUNCTION public.sync_attendance_course() TO service_role;


--
-- Name: FUNCTION sync_session_api_time(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_session_api_time() TO anon;
GRANT ALL ON FUNCTION public.sync_session_api_time() TO authenticated;
GRANT ALL ON FUNCTION public.sync_session_api_time() TO service_role;


--
-- Name: TABLE _prisma_migrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._prisma_migrations TO anon;
GRANT ALL ON TABLE public._prisma_migrations TO authenticated;
GRANT ALL ON TABLE public._prisma_migrations TO service_role;


--
-- Name: TABLE anulaciones_certificados; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.anulaciones_certificados TO anon;
GRANT ALL ON TABLE public.anulaciones_certificados TO authenticated;
GRANT ALL ON TABLE public.anulaciones_certificados TO service_role;


--
-- Name: SEQUENCE anulaciones_certificados_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.anulaciones_certificados_id_seq TO anon;
GRANT ALL ON SEQUENCE public.anulaciones_certificados_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.anulaciones_certificados_id_seq TO service_role;


--
-- Name: TABLE asignaciones_instructores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.asignaciones_instructores TO anon;
GRANT ALL ON TABLE public.asignaciones_instructores TO authenticated;
GRANT ALL ON TABLE public.asignaciones_instructores TO service_role;


--
-- Name: SEQUENCE asignaciones_instructores_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.asignaciones_instructores_id_seq TO anon;
GRANT ALL ON SEQUENCE public.asignaciones_instructores_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.asignaciones_instructores_id_seq TO service_role;


--
-- Name: TABLE asistencias_instructores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.asistencias_instructores TO anon;
GRANT ALL ON TABLE public.asistencias_instructores TO authenticated;
GRANT ALL ON TABLE public.asistencias_instructores TO service_role;


--
-- Name: SEQUENCE asistencias_instructores_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.asistencias_instructores_id_seq TO anon;
GRANT ALL ON SEQUENCE public.asistencias_instructores_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.asistencias_instructores_id_seq TO service_role;


--
-- Name: TABLE asistencias_participantes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.asistencias_participantes TO anon;
GRANT ALL ON TABLE public.asistencias_participantes TO authenticated;
GRANT ALL ON TABLE public.asistencias_participantes TO service_role;


--
-- Name: SEQUENCE asistencias_participantes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.asistencias_participantes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.asistencias_participantes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.asistencias_participantes_id_seq TO service_role;


--
-- Name: TABLE becas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.becas TO anon;
GRANT ALL ON TABLE public.becas TO authenticated;
GRANT ALL ON TABLE public.becas TO service_role;


--
-- Name: SEQUENCE becas_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.becas_id_seq TO anon;
GRANT ALL ON SEQUENCE public.becas_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.becas_id_seq TO service_role;


--
-- Name: TABLE calificaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.calificaciones TO anon;
GRANT ALL ON TABLE public.calificaciones TO authenticated;
GRANT ALL ON TABLE public.calificaciones TO service_role;


--
-- Name: SEQUENCE calificaciones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.calificaciones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.calificaciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.calificaciones_id_seq TO service_role;


--
-- Name: TABLE certificados; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.certificados TO anon;
GRANT ALL ON TABLE public.certificados TO authenticated;
GRANT ALL ON TABLE public.certificados TO service_role;


--
-- Name: SEQUENCE certificados_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.certificados_id_seq TO anon;
GRANT ALL ON SEQUENCE public.certificados_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.certificados_id_seq TO service_role;


--
-- Name: TABLE cursos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cursos TO anon;
GRANT ALL ON TABLE public.cursos TO authenticated;
GRANT ALL ON TABLE public.cursos TO service_role;


--
-- Name: SEQUENCE cursos_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.cursos_id_seq TO anon;
GRANT ALL ON SEQUENCE public.cursos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.cursos_id_seq TO service_role;


--
-- Name: TABLE evaluaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.evaluaciones TO anon;
GRANT ALL ON TABLE public.evaluaciones TO authenticated;
GRANT ALL ON TABLE public.evaluaciones TO service_role;


--
-- Name: SEQUENCE evaluaciones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.evaluaciones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.evaluaciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.evaluaciones_id_seq TO service_role;


--
-- Name: TABLE historial_inscripciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.historial_inscripciones TO service_role;


--
-- Name: SEQUENCE historial_inscripciones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.historial_inscripciones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.historial_inscripciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.historial_inscripciones_id_seq TO service_role;


--
-- Name: TABLE inscripciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inscripciones TO service_role;


--
-- Name: SEQUENCE inscripciones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.inscripciones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.inscripciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.inscripciones_id_seq TO service_role;


--
-- Name: TABLE movimientos_pago; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.movimientos_pago TO service_role;


--
-- Name: SEQUENCE movimientos_pago_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.movimientos_pago_id_seq TO anon;
GRANT ALL ON SEQUENCE public.movimientos_pago_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.movimientos_pago_id_seq TO service_role;


--
-- Name: TABLE pagos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pagos TO service_role;


--
-- Name: SEQUENCE pagos_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.pagos_id_seq TO anon;
GRANT ALL ON SEQUENCE public.pagos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.pagos_id_seq TO service_role;


--
-- Name: TABLE plantillas_certificados; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plantillas_certificados TO service_role;


--
-- Name: SEQUENCE plantillas_certificados_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.plantillas_certificados_id_seq TO anon;
GRANT ALL ON SEQUENCE public.plantillas_certificados_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.plantillas_certificados_id_seq TO service_role;


--
-- Name: TABLE precios_curso; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.precios_curso TO service_role;


--
-- Name: SEQUENCE precios_curso_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.precios_curso_id_seq TO anon;
GRANT ALL ON SEQUENCE public.precios_curso_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.precios_curso_id_seq TO service_role;


--
-- Name: TABLE preinscripciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.preinscripciones TO anon;
GRANT ALL ON TABLE public.preinscripciones TO authenticated;
GRANT ALL ON TABLE public.preinscripciones TO service_role;


--
-- Name: SEQUENCE preinscripciones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.preinscripciones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.preinscripciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.preinscripciones_id_seq TO service_role;


--
-- Name: TABLE resultados_academicos_curso; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.resultados_academicos_curso TO anon;
GRANT ALL ON TABLE public.resultados_academicos_curso TO authenticated;
GRANT ALL ON TABLE public.resultados_academicos_curso TO service_role;


--
-- Name: SEQUENCE resultados_academicos_curso_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.resultados_academicos_curso_id_seq TO anon;
GRANT ALL ON SEQUENCE public.resultados_academicos_curso_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.resultados_academicos_curso_id_seq TO service_role;


--
-- Name: TABLE resultados_curso; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.resultados_curso TO anon;
GRANT ALL ON TABLE public.resultados_curso TO authenticated;
GRANT ALL ON TABLE public.resultados_curso TO service_role;


--
-- Name: SEQUENCE resultados_curso_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.resultados_curso_id_seq TO anon;
GRANT ALL ON SEQUENCE public.resultados_curso_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.resultados_curso_id_seq TO service_role;


--
-- Name: TABLE roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.roles TO anon;
GRANT ALL ON TABLE public.roles TO authenticated;
GRANT ALL ON TABLE public.roles TO service_role;


--
-- Name: SEQUENCE roles_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.roles_id_seq TO anon;
GRANT ALL ON SEQUENCE public.roles_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.roles_id_seq TO service_role;


--
-- Name: TABLE sesiones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sesiones TO anon;
GRANT ALL ON TABLE public.sesiones TO authenticated;
GRANT ALL ON TABLE public.sesiones TO service_role;


--
-- Name: SEQUENCE sesiones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.sesiones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.sesiones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.sesiones_id_seq TO service_role;


--
-- Name: TABLE tipos_participante; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tipos_participante TO service_role;


--
-- Name: SEQUENCE tipos_participante_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tipos_participante_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tipos_participante_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tipos_participante_id_seq TO service_role;


--
-- Name: TABLE usuarios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.usuarios TO service_role;


--
-- Name: SEQUENCE usuarios_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.usuarios_id_seq TO anon;
GRANT ALL ON SEQUENCE public.usuarios_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.usuarios_id_seq TO service_role;


--
-- Name: TABLE usuarios_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.usuarios_roles TO anon;
GRANT ALL ON TABLE public.usuarios_roles TO authenticated;
GRANT ALL ON TABLE public.usuarios_roles TO service_role;


--
-- Name: SEQUENCE usuarios_roles_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.usuarios_roles_id_seq TO anon;
GRANT ALL ON SEQUENCE public.usuarios_roles_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.usuarios_roles_id_seq TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--



-- public-only pg_dump does not include triggers attached to auth.users.
CREATE TRIGGER crear_usuario_al_registrarse AFTER INSERT OR UPDATE OF email,email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.crear_usuario_desde_auth();
NOTIFY pgrst, 'reload schema';
