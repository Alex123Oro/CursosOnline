-- CreateEnum
-- CREATE TYPE "rol_usuario" AS ENUM ('administrador', 'participante');

-- CreateEnum
CREATE TYPE "estado_inscripcion" AS ENUM ('preinscrito', 'inscrito');

-- AlterTable
ALTER TABLE "cursos" ADD COLUMN IF NOT EXISTS "capacidad" INTEGER;
ALTER TABLE "cursos" ADD COLUMN IF NOT EXISTS "fecha_inicio_preinscripcion" TIMESTAMP(3);
ALTER TABLE "cursos" ADD COLUMN IF NOT EXISTS "fecha_fin_preinscripcion" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tipos_participante" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "tipos_participante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "rol" "rol_usuario" NOT NULL,
    "tipo_participante_id" INTEGER,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "precios_curso" (
    "id" SERIAL NOT NULL,
    "curso_id" INTEGER NOT NULL,
    "tipo_participante_id" INTEGER NOT NULL,
    "precio_base" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "precios_curso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "inscripciones" (
    "id" SERIAL NOT NULL,
    "curso_id" INTEGER NOT NULL,
    "participante_id" INTEGER NOT NULL,
    "tipo_participante_id" INTEGER NOT NULL,
    "estado" "estado_inscripcion" NOT NULL DEFAULT 'preinscrito',
    "precio_base" DECIMAL(10,2) NOT NULL,
    "porcentaje_beca" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "beneficio" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "monto_final" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inscripciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pagos" (
    "id" SERIAL NOT NULL,
    "inscripcion_id" INTEGER NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "registrado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tipos_participante_nombre_key" ON "tipos_participante"("nombre");
CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_correo_key" ON "usuarios"("correo");
CREATE UNIQUE INDEX IF NOT EXISTS "precios_curso_curso_id_tipo_participante_id_key" ON "precios_curso"("curso_id", "tipo_participante_id");
CREATE UNIQUE INDEX IF NOT EXISTS "inscripciones_curso_id_participante_id_key" ON "inscripciones"("curso_id", "participante_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pagos_inscripcion_id_key" ON "pagos"("inscripcion_id");

DO $$
BEGIN
    ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tipo_participante_id_fkey" FOREIGN KEY ("tipo_participante_id") REFERENCES "tipos_participante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "precios_curso" ADD CONSTRAINT "precios_curso_curso_id_fkey" FOREIGN KEY ("curso_id") REFERENCES "cursos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "precios_curso" ADD CONSTRAINT "precios_curso_tipo_participante_id_fkey" FOREIGN KEY ("tipo_participante_id") REFERENCES "tipos_participante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "inscripciones" ADD CONSTRAINT "inscripciones_curso_id_fkey" FOREIGN KEY ("curso_id") REFERENCES "cursos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "inscripciones" ADD CONSTRAINT "inscripciones_participante_id_fkey" FOREIGN KEY ("participante_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "inscripciones" ADD CONSTRAINT "inscripciones_tipo_participante_id_fkey" FOREIGN KEY ("tipo_participante_id") REFERENCES "tipos_participante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "pagos" ADD CONSTRAINT "pagos_inscripcion_id_fkey" FOREIGN KEY ("inscripcion_id") REFERENCES "inscripciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
