-- HU4: Publish three catalog courses for the catalog and pre-registration demo.
-- Run this script in Supabase SQL Editor after the project migrations are applied.

BEGIN;

INSERT INTO "tipos_participante" ("nombre")
VALUES
  ('Estudiante'),
  ('Docente'),
  ('Administrativo'),
  ('Externo')
ON CONFLICT ("nombre") DO NOTHING;

WITH "demo_courses" (
  "codigo",
  "nombre",
  "contenido",
  "duracion_horas",
  "instructor",
  "horario",
  "criterios_aprobacion",
  "estado",
  "fecha_inicio",
  "fecha_fin",
  "capacidad",
  "fecha_inicio_preinscripcion",
  "fecha_fin_preinscripcion"
) AS (
  VALUES
    (
      'INF-UX-150',
      'Diseño de Experiencia de Usuario',
      'Principios de investigación, arquitectura de información, prototipado y evaluación de interfaces digitales.',
      24,
      'Ing. Carla Mendoza',
      'Martes y jueves de 18:00 a 20:00',
      'Nota final mínima de 70/100 y asistencia mínima de 80%.',
      'publicado'::"estado_curso",
      DATE '2026-11-02',
      DATE '2026-11-30',
      1,
      DATE '2026-10-01',
      DATE '2026-12-01'
    ),
    (
      'INF-PY-160',
      'Python para Análisis de Datos',
      'Procesamiento de datos con Python, estructuras tabulares, limpieza de información y visualización básica.',
      30,
      'Téc. Diego Quispe',
      'Lunes y miércoles de 18:30 a 21:00',
      'Nota final mínima de 70/100 y asistencia mínima de 80%.',
      'publicado'::"estado_curso",
      DATE '2026-12-01',
      DATE '2026-12-22',
      20,
      DATE '2026-10-01',
      DATE '2026-11-25'
    ),
    (
      'INF-CYB-170',
      'Fundamentos de Ciberseguridad',
      'Buenas prácticas de seguridad, amenazas comunes, protección de cuentas y respuesta inicial ante incidentes.',
      20,
      'Lic. Valeria Ríos',
      'Sábados de 09:00 a 13:00',
      'Nota final mínima de 70/100 y asistencia mínima de 80%.',
      'publicado'::"estado_curso",
      DATE '2027-01-11',
      DATE '2027-02-08',
      18,
      DATE '2026-10-01',
      DATE '2027-01-05'
    )
), "saved_courses" AS (
  INSERT INTO "cursos" (
    "codigo",
    "nombre",
    "contenido",
    "duracion_horas",
    "instructor",
    "instructor_id",
    "horario",
    "criterios_aprobacion",
    "estado",
    "fecha_inicio",
    "fecha_fin",
    "capacidad",
    "fecha_inicio_preinscripcion",
    "fecha_fin_preinscripcion",
    "created_at",
    "updated_at"
  )
  SELECT
    "codigo",
    "nombre",
    "contenido",
    "duracion_horas",
    "instructor",
    NULL,
    "horario",
    "criterios_aprobacion",
    "estado",
    "fecha_inicio",
    "fecha_fin",
    "capacidad",
    "fecha_inicio_preinscripcion",
    "fecha_fin_preinscripcion",
    now(),
    now()
  FROM "demo_courses"
  ON CONFLICT ("codigo") DO UPDATE SET
    "nombre" = EXCLUDED."nombre",
    "contenido" = EXCLUDED."contenido",
    "duracion_horas" = EXCLUDED."duracion_horas",
    "instructor" = EXCLUDED."instructor",
    "horario" = EXCLUDED."horario",
    "criterios_aprobacion" = EXCLUDED."criterios_aprobacion",
    "estado" = EXCLUDED."estado",
    "fecha_inicio" = EXCLUDED."fecha_inicio",
    "fecha_fin" = EXCLUDED."fecha_fin",
    "capacidad" = EXCLUDED."capacidad",
    "fecha_inicio_preinscripcion" = EXCLUDED."fecha_inicio_preinscripcion",
    "fecha_fin_preinscripcion" = EXCLUDED."fecha_fin_preinscripcion",
    "updated_at" = now()
  RETURNING "id", "codigo"
)
INSERT INTO "precios_curso" ("curso_id", "tipo_participante_id", "precio_base")
SELECT
  "saved_courses"."id",
  "tipos_participante"."id",
  "prices"."precio_base"
FROM (
  VALUES
    ('INF-UX-150', 'Estudiante', 400.00::numeric),
    ('INF-UX-150', 'Docente', 500.00::numeric),
    ('INF-UX-150', 'Administrativo', 450.00::numeric),
    ('INF-UX-150', 'Externo', 700.00::numeric),
    ('INF-PY-160', 'Estudiante', 400.00::numeric),
    ('INF-PY-160', 'Docente', 500.00::numeric),
    ('INF-PY-160', 'Administrativo', 450.00::numeric),
    ('INF-PY-160', 'Externo', 700.00::numeric),
    ('INF-CYB-170', 'Estudiante', 400.00::numeric),
    ('INF-CYB-170', 'Docente', 500.00::numeric),
    ('INF-CYB-170', 'Administrativo', 450.00::numeric),
    ('INF-CYB-170', 'Externo', 700.00::numeric)
) AS "prices" ("codigo", "tipo_participante", "precio_base")
JOIN "saved_courses" ON "saved_courses"."codigo" = "prices"."codigo"
JOIN "tipos_participante" ON "tipos_participante"."nombre" = "prices"."tipo_participante"
ON CONFLICT ("curso_id", "tipo_participante_id") DO UPDATE SET
  "precio_base" = EXCLUDED."precio_base";

COMMIT;

SELECT
  "cursos"."codigo",
  "cursos"."nombre",
  "cursos"."estado",
  "cursos"."capacidad",
  COUNT("precios_curso"."id") AS "precios_configurados"
FROM "cursos"
LEFT JOIN "precios_curso" ON "precios_curso"."curso_id" = "cursos"."id"
WHERE "cursos"."codigo" IN ('INF-UX-150', 'INF-PY-160', 'INF-CYB-170')
GROUP BY "cursos"."id"
ORDER BY "cursos"."codigo";
