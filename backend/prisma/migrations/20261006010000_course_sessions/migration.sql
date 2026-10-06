-- HU-08: additive changes only. Existing course names remain intact.
ALTER TYPE "rol_usuario" ADD VALUE IF NOT EXISTS 'instructor';
ALTER TABLE "cursos" ADD COLUMN "instructor_id" INTEGER;
ALTER TABLE "cursos" ADD CONSTRAINT "cursos_instructor_id_fkey"
  FOREIGN KEY ("instructor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "sesiones_curso" (
  "id" SERIAL PRIMARY KEY,
  "curso_id" INTEGER NOT NULL,
  "fecha" DATE NOT NULL,
  "hora_inicio" VARCHAR(5) NOT NULL,
  "duracion_minutos" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sesiones_curso_curso_id_fkey" FOREIGN KEY ("curso_id") REFERENCES "cursos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sesiones_curso_duracion_check" CHECK ("duracion_minutos" > 0)
);
CREATE UNIQUE INDEX "sesiones_curso_curso_id_fecha_hora_inicio_key"
  ON "sesiones_curso"("curso_id", "fecha", "hora_inicio");
