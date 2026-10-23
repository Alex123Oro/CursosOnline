ALTER TABLE public.inscripciones ADD COLUMN IF NOT EXISTS cerrada_en timestamp(3), ADD COLUMN IF NOT EXISTS motivo_cierre text;

CREATE TABLE IF NOT EXISTS public.movimientos_pago (
  id serial PRIMARY KEY,
  inscripcion_id integer NOT NULL REFERENCES public.inscripciones(id) ON DELETE RESTRICT,
  tipo varchar(12) NOT NULL CHECK(tipo IN ('APERTURA','ABONO','DEVOLUCION','AJUSTE')),
  monto numeric(10,2) NOT NULL,
  motivo text NOT NULL CHECK(length(btrim(motivo))>=3),
  referencia varchar(100),
  solicitud_id uuid NOT NULL UNIQUE,
  registrado_por bigint REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  registrado_en timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo='ABONO' AND monto>0) OR (tipo='DEVOLUCION' AND monto<0) OR (tipo='AJUSTE' AND monto<>0) OR (tipo='APERTURA' AND monto>=0))
);
CREATE INDEX IF NOT EXISTS movimientos_pago_inscripcion_fecha ON public.movimientos_pago(inscripcion_id,registrado_en);
INSERT INTO public.movimientos_pago(inscripcion_id,tipo,monto,motivo,solicitud_id,registrado_en)
SELECT p.inscripcion_id,'APERTURA',p.monto,'Saldo existente al incorporar el historial de pagos',md5('eva-opening-payment-'||p.id::text)::uuid,p.registrado_en
FROM public.pagos p WHERE NOT EXISTS(SELECT 1 FROM public.movimientos_pago m WHERE m.inscripcion_id=p.inscripcion_id)
ON CONFLICT(solicitud_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.historial_inscripciones (
  id serial PRIMARY KEY,
  inscripcion_id integer NOT NULL REFERENCES public.inscripciones(id) ON DELETE RESTRICT,
  estado public.estado_inscripcion NOT NULL,
  motivo text NOT NULL,
  registrado_por bigint REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  registrado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS historial_inscripciones_inscripcion_fecha ON public.historial_inscripciones(inscripcion_id,registrado_en);
INSERT INTO public.historial_inscripciones(inscripcion_id,estado,motivo,registrado_en)
SELECT i.id,i.estado,'Estado existente al incorporar el historial',coalesce(i.confirmada_en,i.created_at)
FROM public.inscripciones i WHERE NOT EXISTS(SELECT 1 FROM public.historial_inscripciones h WHERE h.inscripcion_id=i.id);

-- Preserve all attendance rows and replace only the one-instructor uniqueness rule.
DO $attendance$
DECLARE item record;
BEGIN
  FOR item IN SELECT c.conname FROM pg_constraint c WHERE c.conrelid='public.asistencias_instructores'::regclass AND c.contype='u'
    AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k)
      IN (ARRAY['sesion_id']::text[],ARRAY['curso_id','sesion_id']::text[])
  LOOP EXECUTE format('ALTER TABLE public.asistencias_instructores DROP CONSTRAINT %I',item.conname); END LOOP;
  FOR item IN SELECT ci.relname FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid
    WHERE i.indrelid='public.asistencias_instructores'::regclass AND i.indisunique AND NOT i.indisprimary
    AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM unnest(i.indkey::smallint[]) k JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k)
      IN (ARRAY['sesion_id']::text[],ARRAY['curso_id','sesion_id']::text[])
  LOOP EXECUTE format('DROP INDEX public.%I',item.relname); END LOOP;
END $attendance$;
CREATE UNIQUE INDEX IF NOT EXISTS asistencias_instructores_sesion_id_instructor_id_key ON public.asistencias_instructores(sesion_id,instructor_id);

CREATE OR REPLACE FUNCTION public.preserve_payment_movement() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $immutable$
BEGIN RAISE EXCEPTION 'Payment history is append-only' USING ERRCODE='P0409'; END;
$immutable$;
DROP TRIGGER IF EXISTS preserve_payment_history ON public.movimientos_pago;
CREATE TRIGGER preserve_payment_history BEFORE UPDATE OR DELETE ON public.movimientos_pago FOR EACH ROW EXECUTE FUNCTION public.preserve_payment_movement();

DO $permissions$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['movimientos_pago','historial_inscripciones'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',table_name);
    EXECUTE format('GRANT SELECT,INSERT ON public.%I TO service_role',table_name);
    EXECUTE format('GRANT USAGE,SELECT ON SEQUENCE public.%I TO service_role',table_name||'_id_seq');
  END LOOP;
END $permissions$;
