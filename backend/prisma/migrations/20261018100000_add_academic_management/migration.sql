-- Academic results are a recalculable cache. resultados_curso belongs to
-- certificate issuance and must keep its existing columns and certificate FKs.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'estado_resultado_curso' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE estado_resultado_curso AS ENUM (
      'pendiente', 'aprobado', 'reprobado', 'no_cumple_asistencia'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS asignaciones_instructores (
  id SERIAL PRIMARY KEY,
  curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  instructor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  asignado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  fecha_asignacion TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT asignaciones_instructores_curso_id_instructor_id_key UNIQUE (curso_id, instructor_id)
);
CREATE INDEX IF NOT EXISTS asignaciones_instructores_instructor_id_idx
  ON asignaciones_instructores(instructor_id);

-- Preserve assignments from before multiple instructors were supported.
INSERT INTO asignaciones_instructores(curso_id, instructor_id)
  SELECT id, instructor_id FROM cursos WHERE instructor_id IS NOT NULL
  ON CONFLICT (curso_id, instructor_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS resultados_academicos_curso (
  id SERIAL PRIMARY KEY,
  curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  inscripcion_id INTEGER NOT NULL UNIQUE,
  nota_final DECIMAL(7,2),
  porcentaje_asistencia DECIMAL(5,2),
  estado estado_resultado_curso NOT NULL DEFAULT 'pendiente',
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  fecha_calculo TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT resultados_academicos_curso_inscripcion_id_curso_id_key UNIQUE (inscripcion_id, curso_id),
  CONSTRAINT resultados_academicos_curso_inscripcion_id_curso_id_fkey
    FOREIGN KEY (inscripcion_id, curso_id) REFERENCES inscripciones(id, curso_id)
    ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE INDEX IF NOT EXISTS resultados_academicos_curso_curso_id_idx
  ON resultados_academicos_curso(curso_id);

-- Tables are accessed through the backend connection.
ALTER TABLE asignaciones_instructores ENABLE ROW LEVEL SECURITY;
ALTER TABLE resultados_academicos_curso ENABLE ROW LEVEL SECURITY;
