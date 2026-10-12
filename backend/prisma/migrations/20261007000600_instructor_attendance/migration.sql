BEGIN;
CREATE TABLE "asistencias_instructor" (
  "id" SERIAL PRIMARY KEY,
  "curso_id" INTEGER NOT NULL,
  "sesion_id" INTEGER NOT NULL,
  "instructor_id" INTEGER NOT NULL,
  "estado" "estado_asistencia" NOT NULL,
  "registrado_por_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asistencias_instructor_sesion_id_curso_id_fkey" FOREIGN KEY ("sesion_id", "curso_id") REFERENCES "sesiones_curso"("id", "curso_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "asistencias_instructor_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "asistencias_instructor_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "asistencias_instructor_sesion_id_key" ON "asistencias_instructor"("sesion_id");
CREATE UNIQUE INDEX "asistencias_instructor_sesion_id_curso_id_key" ON "asistencias_instructor"("sesion_id", "curso_id");
CREATE INDEX "asistencias_instructor_instructor_id_idx" ON "asistencias_instructor"("instructor_id");
COMMIT;
