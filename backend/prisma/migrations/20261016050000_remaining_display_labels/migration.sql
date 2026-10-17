BEGIN;
-- Demonstration provenance remains in cursos.es_demostracion and certificate metadata.
UPDATE public.cursos SET codigo=replace(replace(codigo,'EVA-PRUEBA-','EVA-'),'EVA-FLUJO-','EVA-')
WHERE es_demostracion AND (codigo LIKE 'EVA-PRUEBA-%' OR codigo LIKE 'EVA-FLUJO-%');
UPDATE public.cursos SET instructor=public.clean_demo_display_name(instructor)
WHERE es_demostracion AND instructor IS DISTINCT FROM public.clean_demo_display_name(instructor);
UPDATE public.cursos SET contenido='Contenido del curso: ' || nombre || '.'
WHERE es_demostracion AND contenido ~* 'sint[eé]tic';
UPDATE public.cursos SET descripcion=nombre WHERE es_demostracion AND descripcion='DEMOSTRACION SIN VALIDEZ ACADEMICA';
UPDATE public.inscripciones i SET motivo_beca=CASE
  WHEN motivo_beca='Beca sintética para probar el sistema' THEN 'Beca de formación'
  ELSE regexp_replace(motivo_beca,'^PRUEBA:[[:space:]]*','','i') END
FROM public.cursos c WHERE c.id=i.curso_id AND c.es_demostracion AND motivo_beca ~* 'sint[eé]tic|^PRUEBA:';
UPDATE public.calificaciones g SET observacion=regexp_replace(observacion,'^PRUEBA:[[:space:]]*','','i')
FROM public.inscripciones i JOIN public.cursos c ON c.id=i.curso_id
WHERE g.inscripcion_id=i.id AND c.es_demostracion AND observacion ~* '^PRUEBA:';
UPDATE public.evaluaciones e SET nombre=replace(e.nombre,' de prueba',''),
  descripcion=CASE WHEN e.descripcion='DEMOSTRACION SIN VALIDEZ ACADEMICA' THEN 'Evaluación del curso' ELSE e.descripcion END
FROM public.cursos c WHERE c.id=e.curso_id AND c.es_demostracion AND (e.nombre LIKE '% de prueba' OR e.descripcion='DEMOSTRACION SIN VALIDEZ ACADEMICA');
UPDATE public.sesiones s SET titulo=replace(s.titulo,' de prueba',''),
  descripcion=CASE WHEN s.descripcion='DEMOSTRACION SIN VALIDEZ ACADEMICA' THEN 'Sesión del curso' ELSE s.descripcion END
FROM public.cursos c WHERE c.id=s.curso_id AND c.es_demostracion AND (s.titulo LIKE '% de prueba' OR s.descripcion='DEMOSTRACION SIN VALIDEZ ACADEMICA');
UPDATE public.asistencias_participantes a SET observacion=''
FROM public.cursos c WHERE c.id=a.curso_id AND c.es_demostracion AND a.observacion='DEMOSTRACION SIN VALIDEZ ACADEMICA';
CREATE OR REPLACE FUNCTION public.clean_course_display_name() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  NEW.es_demostracion:=NEW.es_demostracion OR NEW.nombre ILIKE '%DEMOSTRACION SIN VALIDEZ ACADEMICA%'
    OR COALESCE(NEW.codigo LIKE 'EVA-PRUEBA-%' OR NEW.codigo LIKE 'EVA-FLUJO-%',false);
  NEW.nombre:=public.clean_demo_display_name(NEW.nombre);
  NEW.instructor:=public.clean_demo_display_name(NEW.instructor);
  RETURN NEW;
END $$;
DROP TRIGGER cursos_display_name ON public.cursos;
CREATE TRIGGER cursos_display_name BEFORE INSERT OR UPDATE OF nombre,codigo,instructor,es_demostracion ON public.cursos
FOR EACH ROW EXECUTE FUNCTION public.clean_course_display_name();
COMMIT;
