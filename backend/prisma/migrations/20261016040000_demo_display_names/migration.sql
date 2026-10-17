-- Keep demonstration provenance as metadata instead of placing it in display names.
BEGIN;
CREATE FUNCTION public.clean_demo_display_name(value TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT SET search_path=public,pg_temp AS $$
  SELECT trim(regexp_replace(
    regexp_replace(value,'^\[(PRUEBA( FLUJO)?|DEMO)\][[:space:]]*','','i'),
    '[[:space:]]*[-·]?[[:space:]]*DEMOSTRACION SIN VALIDEZ ACADEMICA[[:space:]]*$','','i'));
$$;
ALTER TABLE public.cursos ADD COLUMN es_demostracion BOOLEAN NOT NULL DEFAULT false;
UPDATE public.cursos SET es_demostracion=true WHERE nombre ILIKE '%DEMOSTRACION SIN VALIDEZ ACADEMICA%'
  OR codigo LIKE 'EVA-PRUEBA-%' OR codigo LIKE 'EVA-FLUJO-%';
CREATE FUNCTION public.clean_course_display_name() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  NEW.es_demostracion:=NEW.es_demostracion OR NEW.nombre ILIKE '%DEMOSTRACION SIN VALIDEZ ACADEMICA%'
    OR COALESCE(NEW.codigo LIKE 'EVA-PRUEBA-%' OR NEW.codigo LIKE 'EVA-FLUJO-%',false);
  NEW.nombre:=public.clean_demo_display_name(NEW.nombre);
  RETURN NEW;
END $$;
CREATE TRIGGER cursos_display_name BEFORE INSERT OR UPDATE OF nombre,codigo,es_demostracion ON public.cursos
  FOR EACH ROW EXECUTE FUNCTION public.clean_course_display_name();
CREATE FUNCTION public.clean_user_display_name() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  NEW.nombre_completo:=replace(public.clean_demo_display_name(NEW.nombre_completo),'Participante de prueba ','Participante ');
  NEW.nombre:=replace(public.clean_demo_display_name(NEW.nombre),'Participante de prueba ','Participante ');
  RETURN NEW;
END $$;
CREATE TRIGGER usuarios_display_name BEFORE INSERT OR UPDATE OF nombre_completo,nombre ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.clean_user_display_name();
UPDATE public.cursos SET nombre=public.clean_demo_display_name(nombre) WHERE nombre IS DISTINCT FROM public.clean_demo_display_name(nombre);
UPDATE public.usuarios SET nombre_completo=replace(public.clean_demo_display_name(nombre_completo),'Participante de prueba ','Participante '),
  nombre=replace(public.clean_demo_display_name(nombre),'Participante de prueba ','Participante ')
  WHERE nombre_completo ~* '^\[(PRUEBA|DEMO)' OR nombre ~* '^\[(PRUEBA|DEMO)' OR nombre_completo LIKE 'Participante de prueba %';
CREATE FUNCTION public.clean_certificate_display_name() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE demonstration BOOLEAN;
BEGIN
  SELECT c.es_demostracion INTO demonstration FROM public.resultados_curso r JOIN public.inscripciones i ON i.id=r.inscripcion_id
    JOIN public.cursos c ON c.id=i.curso_id WHERE r.id=NEW.resultado_curso_id;
  NEW.datos_emision:=jsonb_set(jsonb_set(NEW.datos_emision,'{courseName}',to_jsonb(public.clean_demo_display_name(NEW.datos_emision->>'courseName'))),
    '{participantName}',to_jsonb(replace(public.clean_demo_display_name(NEW.datos_emision->>'participantName'),'Participante de prueba ','Participante ')))
    || jsonb_build_object('demo',COALESCE(demonstration,false) OR COALESCE((NEW.datos_emision->>'demo')::boolean,false));
  RETURN NEW;
END $$;
CREATE TRIGGER certificados_display_name BEFORE INSERT OR UPDATE OF datos_emision ON public.certificados
  FOR EACH ROW EXECUTE FUNCTION public.clean_certificate_display_name();
UPDATE public.certificados SET datos_emision=datos_emision;
UPDATE public.calificaciones SET observacion=NULL WHERE observacion='DEMOSTRACION SIN VALIDEZ ACADEMICA';
NOTIFY pgrst,'reload schema';
COMMIT;
