ALTER TABLE "cursos"
  ADD COLUMN "minimo_inscritos" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "cursos"
  ADD CONSTRAINT "cursos_minimo_inscritos_check"
  CHECK ("minimo_inscritos" > 0 AND ("capacidad" IS NULL OR "minimo_inscritos" <= "capacidad"));
