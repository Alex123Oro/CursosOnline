
-- Nuevo enum para resultados finales

CREATE TYPE "estado_resultado_curso" AS ENUM (
    'pendiente',
    'aprobado',
    'reprobado',
    'no_cumple_asistencia'
);

-- Asignaciones de instructores

CREATE TABLE "asignaciones_instructores" (
    "id" SERIAL NOT NULL,
    "curso_id" INTEGER NOT NULL,
    "instructor_id" INTEGER NOT NULL,
    "asignado_por" INTEGER,
    "fecha_asignacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignaciones_instructores_pkey"
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX
    "asignaciones_instructores_curso_id_instructor_id_key"
ON "asignaciones_instructores"("curso_id", "instructor_id");

CREATE INDEX
    "asignaciones_instructores_instructor_id_idx"
ON "asignaciones_instructores"("instructor_id");

ALTER TABLE "asignaciones_instructores"
ADD CONSTRAINT "asignaciones_instructores_curso_id_fkey"
FOREIGN KEY ("curso_id")
REFERENCES "cursos"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asignaciones_instructores"
ADD CONSTRAINT "asignaciones_instructores_instructor_id_fkey"
FOREIGN KEY ("instructor_id")
REFERENCES "usuarios"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asignaciones_instructores"
ADD CONSTRAINT "asignaciones_instructores_asignado_por_fkey"
FOREIGN KEY ("asignado_por")
REFERENCES "usuarios"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Resultados finales

CREATE TABLE "resultados_curso" (
    "id" SERIAL NOT NULL,
    "curso_id" INTEGER NOT NULL,
    "inscripcion_id" INTEGER NOT NULL,
    "nota_final" DECIMAL(7,2),
    "porcentaje_asistencia" DECIMAL(5,2),
    "estado" "estado_resultado_curso" NOT NULL DEFAULT 'pendiente',
    "registrado_por" INTEGER,
    "fecha_calculo" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resultados_curso_pkey"
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX
    "resultados_curso_inscripcion_id_key"
ON "resultados_curso"("inscripcion_id");

CREATE UNIQUE INDEX
    "resultados_curso_inscripcion_id_curso_id_key"
ON "resultados_curso"("inscripcion_id", "curso_id");

CREATE INDEX "resultados_curso_curso_id_idx"
ON "resultados_curso"("curso_id");

ALTER TABLE "resultados_curso"
ADD CONSTRAINT "resultados_curso_curso_id_fkey"
FOREIGN KEY ("curso_id")
REFERENCES "cursos"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resultados_curso"
ADD CONSTRAINT "resultados_curso_inscripcion_id_curso_id_fkey"
FOREIGN KEY ("inscripcion_id", "curso_id")
REFERENCES "inscripciones"("id", "curso_id")
ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "resultados_curso"
ADD CONSTRAINT "resultados_curso_registrado_por_fkey"
FOREIGN KEY ("registrado_por")
REFERENCES "usuarios"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
