ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS portada_url TEXT;
NOTIFY pgrst, 'reload schema';
