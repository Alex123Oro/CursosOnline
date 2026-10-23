-- Existing accounts and enrollment prices are preserved. Only new verified
-- public registrations are classified using their confirmed email address.
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS registro_publico boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS correo_verificado_en timestamptz;

INSERT INTO public.tipos_participante(nombre) VALUES ('Estudiante'), ('Externo')
ON CONFLICT (nombre) DO NOTHING;

CREATE OR REPLACE FUNCTION public.crear_usuario_desde_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $registration$
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
$registration$;

DROP TRIGGER IF EXISTS crear_usuario_al_registrarse ON auth.users;
CREATE TRIGGER crear_usuario_al_registrarse
AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.crear_usuario_desde_auth();

REVOKE ALL ON FUNCTION public.crear_usuario_desde_auth() FROM PUBLIC;

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usuarios FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios TO service_role;
