ALTER TABLE "cursos"
  ADD COLUMN IF NOT EXISTS "nota_minima_aprobacion" DECIMAL(5,2) NOT NULL DEFAULT 70;

CREATE TABLE IF NOT EXISTS "evaluaciones" (
  "id" SERIAL NOT NULL,
  "curso_id" INTEGER NOT NULL,
  "titulo" TEXT NOT NULL,
  "puntaje_maximo" DECIMAL(7,2) NOT NULL DEFAULT 100,
  "ponderacion" DECIMAL(7,2) NOT NULL DEFAULT 100,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evaluaciones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "calificaciones" (
  "id" SERIAL NOT NULL,
  "evaluacion_id" INTEGER NOT NULL,
  "inscripcion_id" INTEGER NOT NULL,
  "nota" DECIMAL(7,2) NOT NULL,
  "observacion" TEXT,
  "calificada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calificaciones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evaluaciones_curso_id_titulo_key"
  ON "evaluaciones"("curso_id", "titulo");
CREATE UNIQUE INDEX IF NOT EXISTS "calificaciones_evaluacion_id_inscripcion_id_key"
  ON "calificaciones"("evaluacion_id", "inscripcion_id");

DO $$
BEGIN
  ALTER TABLE "evaluaciones" ADD CONSTRAINT "evaluaciones_curso_id_fkey"
    FOREIGN KEY ("curso_id") REFERENCES "cursos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_evaluacion_id_fkey"
    FOREIGN KEY ("evaluacion_id") REFERENCES "evaluaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_inscripcion_id_fkey"
    FOREIGN KEY ("inscripcion_id") REFERENCES "inscripciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;