-- Align the application with the existing Supabase tables. No parallel academic tables.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='grado_instructor' AND typnamespace='public'::regnamespace) THEN
    CREATE TYPE public.grado_instructor AS ENUM ('estudiante','ingeniero','tecnico');
  END IF;
END $$;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS codigo_sis TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS grado public.grado_instructor;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_codigo_sis_key ON public.usuarios(codigo_sis);
ALTER TABLE public.cursos ALTER COLUMN horario SET DEFAULT '';
ALTER TABLE public.cursos ALTER COLUMN contenido SET DEFAULT '';

-- Preserve the native TIME columns used by Supabase and expose a synchronized HH:MM projection to Prisma.
ALTER TABLE public.sesiones ADD COLUMN IF NOT EXISTS hora_inicio_api VARCHAR(5);
ALTER TABLE public.sesiones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE public.sesiones SET hora_inicio_api=to_char(hora_inicio,'HH24:MI') WHERE hora_inicio_api IS NULL;
ALTER TABLE public.sesiones ALTER COLUMN hora_inicio_api SET NOT NULL;
CREATE FUNCTION public.sync_session_api_time() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
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
CREATE TRIGGER sesiones_api_time BEFORE INSERT OR UPDATE ON public.sesiones FOR EACH ROW EXECUTE FUNCTION public.sync_session_api_time();
CREATE UNIQUE INDEX IF NOT EXISTS sesiones_id_curso_id_key ON public.sesiones(id,curso_id);
CREATE UNIQUE INDEX IF NOT EXISTS sesiones_curso_fecha_inicio_key ON public.sesiones(curso_id,fecha,hora_inicio_api);
CREATE UNIQUE INDEX IF NOT EXISTS inscripciones_id_curso_id_key ON public.inscripciones(id,curso_id);

ALTER TABLE public.asistencias_participantes ADD COLUMN IF NOT EXISTS curso_id BIGINT;
ALTER TABLE public.asistencias_participantes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE public.asistencias_participantes a SET curso_id=s.curso_id FROM public.sesiones s WHERE s.id=a.sesion_id AND a.curso_id IS NULL;
ALTER TABLE public.asistencias_participantes ALTER COLUMN curso_id SET NOT NULL;
ALTER TABLE public.asistencias_participantes ADD CONSTRAINT asistencias_participantes_sesion_curso_fkey FOREIGN KEY(sesion_id,curso_id) REFERENCES public.sesiones(id,curso_id);
ALTER TABLE public.asistencias_participantes ADD CONSTRAINT asistencias_participantes_inscripcion_curso_fkey FOREIGN KEY(inscripcion_id,curso_id) REFERENCES public.inscripciones(id,curso_id);
ALTER TABLE public.asistencias_instructores ADD COLUMN IF NOT EXISTS curso_id BIGINT;
ALTER TABLE public.asistencias_instructores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE public.asistencias_instructores a SET curso_id=s.curso_id FROM public.sesiones s WHERE s.id=a.sesion_id AND a.curso_id IS NULL;
ALTER TABLE public.asistencias_instructores ALTER COLUMN curso_id SET NOT NULL;
ALTER TABLE public.asistencias_instructores ADD CONSTRAINT asistencias_instructores_sesion_curso_fkey FOREIGN KEY(sesion_id,curso_id) REFERENCES public.sesiones(id,curso_id);
CREATE UNIQUE INDEX IF NOT EXISTS asistencias_instructores_sesion_key ON public.asistencias_instructores(sesion_id);
CREATE UNIQUE INDEX IF NOT EXISTS asistencias_instructores_sesion_curso_key ON public.asistencias_instructores(sesion_id,curso_id);
CREATE FUNCTION public.sync_attendance_course() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE selected_course BIGINT;
BEGIN
  SELECT curso_id INTO selected_course FROM public.sesiones WHERE id=NEW.sesion_id;
  IF NEW.curso_id IS NULL THEN NEW.curso_id:=selected_course; END IF;
  IF NEW.curso_id IS DISTINCT FROM selected_course THEN RAISE EXCEPTION 'Attendance course mismatch' USING ERRCODE='23514'; END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END $$;
CREATE TRIGGER asistencias_participantes_course BEFORE INSERT OR UPDATE ON public.asistencias_participantes FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_course();
CREATE TRIGGER asistencias_instructores_course BEFORE INSERT OR UPDATE ON public.asistencias_instructores FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_course();

ALTER TABLE public.evaluaciones ADD COLUMN IF NOT EXISTS puntaje_maximo NUMERIC(7,2) NOT NULL DEFAULT 100;
ALTER TABLE public.evaluaciones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS evaluaciones_curso_nombre_key ON public.evaluaciones(curso_id,nombre);
UPDATE public.calificaciones SET fecha_modificacion=fecha_registro WHERE fecha_modificacion IS NULL;
ALTER TABLE public.calificaciones ALTER COLUMN fecha_modificacion SET DEFAULT now();
ALTER TABLE public.calificaciones ALTER COLUMN fecha_modificacion SET NOT NULL;
NOTIFY pgrst,'reload schema';
COMMIT;
