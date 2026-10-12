ALTER TABLE "inscripciones"
  ADD COLUMN "confirmada_en" TIMESTAMP(3),
  ADD COLUMN "motivo_beca" TEXT,
  ADD COLUMN "beca_activa" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "inscripciones"
SET "confirmada_en" = "updated_at"
WHERE "estado" = 'inscrito';

UPDATE "inscripciones"
SET "beca_activa" = TRUE,
    "motivo_beca" = 'Beca existente migrada'
WHERE "porcentaje_beca" > 0;

ALTER TABLE "sesiones_curso" ADD COLUMN "numero_sesion" INTEGER;
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "curso_id" ORDER BY "fecha", "hora_inicio", "id") AS n
  FROM "sesiones_curso"
)
UPDATE "sesiones_curso" s SET "numero_sesion" = numbered.n
FROM numbered WHERE s."id" = numbered."id";
ALTER TABLE "sesiones_curso" ALTER COLUMN "numero_sesion" SET NOT NULL;
ALTER TABLE "sesiones_curso" ADD CONSTRAINT "sesiones_curso_numero_sesion_check" CHECK ("numero_sesion" > 0);
CREATE UNIQUE INDEX "sesiones_curso_curso_id_numero_sesion_key"
  ON "sesiones_curso"("curso_id", "numero_sesion");
