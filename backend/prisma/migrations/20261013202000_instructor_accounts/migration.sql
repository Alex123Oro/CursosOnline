-- Existing users keep null values; new instructor accounts are validated by the API.
CREATE TYPE "grado_instructor" AS ENUM ('estudiante', 'ingeniero', 'tecnico');

ALTER TABLE "usuarios"
  ADD COLUMN "codigo_sis" TEXT,
  ADD COLUMN "grado" "grado_instructor",
  ADD COLUMN "telefono" TEXT;

CREATE UNIQUE INDEX "usuarios_codigo_sis_key" ON "usuarios"("codigo_sis");

ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_codigo_sis_format_check"
  CHECK ("codigo_sis" IS NULL OR "codigo_sis" ~ '^[0-9]{9}$');
