-- Commit enum additions before using the new values in subsequent transactions.
ALTER TYPE public.estado_inscripcion ADD VALUE IF NOT EXISTS 'cancelado';
ALTER TYPE public.estado_inscripcion ADD VALUE IF NOT EXISTS 'rechazado';
ALTER TYPE public.estado_inscripcion ADD VALUE IF NOT EXISTS 'caducado';
