BEGIN;
CREATE TABLE public.plantillas_certificados (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL CHECK (length(nombre) BETWEEN 3 AND 100),
  tipo TEXT NOT NULL CHECK (tipo IN ('aprobacion','participacion')),
  config JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  clave_inicial TEXT UNIQUE,
  creado_por BIGINT REFERENCES public.usuarios(id),
  actualizado_por BIGINT REFERENCES public.usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plantillas_certificados ENABLE ROW LEVEL SECURITY;
DO $permissions$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.plantillas_certificados FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.plantillas_certificados FROM authenticated; END IF;
END $permissions$;
DO $permissions$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT SELECT,INSERT,UPDATE ON public.plantillas_certificados TO service_role; END IF;
END $permissions$;
DO $permissions$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT USAGE,SELECT ON SEQUENCE public.plantillas_certificados_id_seq TO service_role; END IF;
END $permissions$;

CREATE FUNCTION public.emit_certificate_with_template(p_enrollment_id BIGINT,p_code TEXT,p_public_url TEXT,p_actor_id BIGINT,p_type TEXT,p_template_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
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
REVOKE ALL ON FUNCTION public.emit_certificate_with_template(BIGINT,TEXT,TEXT,BIGINT,TEXT,BIGINT) FROM PUBLIC;
DO $permissions$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON FUNCTION public.emit_certificate_with_template(BIGINT,TEXT,TEXT,BIGINT,TEXT,BIGINT) FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON FUNCTION public.emit_certificate_with_template(BIGINT,TEXT,TEXT,BIGINT,TEXT,BIGINT) FROM authenticated; END IF;
END $permissions$;
DO $permissions$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT EXECUTE ON FUNCTION public.emit_certificate_with_template(BIGINT,TEXT,TEXT,BIGINT,TEXT,BIGINT) TO service_role; END IF;
END $permissions$;
NOTIFY pgrst,'reload schema';
COMMIT;
