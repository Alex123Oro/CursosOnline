BEGIN;
CREATE TYPE "estado_asistencia" AS ENUM ('presente', 'ausente');
CREATE UNIQUE INDEX "sesiones_curso_id_curso_id_key" ON "sesiones_curso"("id", "curso_id");
CREATE UNIQUE INDEX "inscripciones_id_curso_id_key" ON "inscripciones"("id", "curso_id");
CREATE TABLE "asistencias" (
  "id" SERIAL PRIMARY KEY,
  "curso_id" INTEGER NOT NULL,
  "sesion_id" INTEGER NOT NULL,
  "inscripcion_id" INTEGER NOT NULL,
  "estado" "estado_asistencia" NOT NULL,
  "registrado_por_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asistencias_sesion_id_curso_id_fkey" FOREIGN KEY ("sesion_id", "curso_id") REFERENCES "sesiones_curso"("id", "curso_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "asistencias_inscripcion_id_curso_id_fkey" FOREIGN KEY ("inscripcion_id", "curso_id") REFERENCES "inscripciones"("id", "curso_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "asistencias_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "asistencias_sesion_id_inscripcion_id_key" ON "asistencias"("sesion_id", "inscripcion_id");
CREATE INDEX "asistencias_inscripcion_id_idx" ON "asistencias"("inscripcion_id");
COMMIT;
