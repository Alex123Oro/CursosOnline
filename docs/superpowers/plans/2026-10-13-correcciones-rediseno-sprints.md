# Correcciones y rediseño de sprints — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to execute this plan task-by-task in this chat. Steps use checkbox syntax for tracking.

**Goal:** Crear `codex/correcciones-rediseno-sprints` desde `develop` y registrar los cambios existentes en commits atómicos, sin perder trabajo.

**Architecture:** Los cambios están en el checkout principal de develop, mientras este chat usa un worktree limpio con HEAD separado. Capturar los cambios del checkout principal y trasladarlos al worktree autorizado antes de agruparlos por comportamiento, con implementación y pruebas juntas. Separar los ajustes visuales compartidos de las correcciones funcionales mediante staging selectivo cuando un archivo tenga ambos.

**Tech Stack:** Angular, TypeScript, Express, Prisma, PostgreSQL/Supabase, Vitest, Git.

**Spec:** Solicitud del usuario en este chat: crear una rama para corrección de bugs y rediseño de sprints anteriores; commits atómicos de todo lo existente; primero planificar.

## Global Constraints

- La prohibición de crear rama o commits correspondía a la fase de planificación; el usuario autorizó ejecutar el plan después.
- Base observada: develop en 2e9b266. Revalidar antes de ejecutar.
- Origen de cambios: C:/Users/bruno/OneDrive/Escritorio/Materias/CursosOnline.
- Destino autorizado: C:/Users/bruno/.codex/worktrees/758d/CursosOnline.
- Preservar cambios y archivos nuevos del origen; no reset, clean ni stash destructivo.
- No ejecutar semillas, migraciones contra bases conectadas, push ni merge.
- Los nombres de conversaciones deben contener tres palabras y comenzar con mayúscula.
- El plan se guarda en este worktree; incorporarlo como documentación al ejecutar.

## Review Focus

- Mínimo de inscritos: valores positivos enteros, límite de capacidad y actualizaciones que omiten el mínimo existente; pruebas course.rules y course.update.
- Guardado parcial: creación exitosa y fallo de precios seguido de reintento sin duplicar curso; courses-page.spec.ts.
- Sesiones: permisos distintos para programar y editar/eliminar, bloqueo después de registrar asistencia del instructor; pruebas de servicios, rutas y página.
- Asistencia: fecha pasada/futura, orden descendente y advertencias; pruebas de páginas y servicio de asistencia de instructor.
- Rediseño: navegación por rol, foco, controles y pantallas pequeñas; compilación y revisión visual local.

## Task 1: Capturar y trasladar el trabajo existente

- [ ] Revalidar status, HEAD y diffs staged/unstaged en ambos checkouts. El origen observado tiene 48 archivos modificados y tres entradas nuevas: migración, prueba courses-page y minimum-enrollment.patch; no hay staged.
- [ ] Guardar un respaldo de diffs binarios y archivos nuevos en una carpeta temporal. No imprimir secretos ni incluir archivos de entorno.
- [ ] Crear la rama `codex/correcciones-rediseno-sprints` desde el develop local en el worktree de este chat; comprobar que el nombre está disponible.
- [ ] Aplicar el respaldo al destino sin modificar el origen. Comparar inventario y contenido para confirmar una copia completa.
- [ ] Revisar minimum-enrollment.patch (113265 bytes observados) para decidir si es un respaldo redundante o una fuente de cambios adicionales. No volver a aplicarlo sin comprobarlo. Conservarlo; no descartarlo silenciosamente.

## Task 2: Mínimo de inscritos en backend

**Commit:** `feat(courses): validar minimo de inscritos y capacidad`

**Files:** backend/prisma/schema.prisma; backend/prisma/migrations/20261012020000_course_minimum_enrollment/migration.sql; backend/src/modules/courses/course.rules.ts; backend/src/modules/courses/course.service.ts; backend/tests/course.rules.test.ts; backend/tests/course.update.test.ts.

- [ ] Revisar que esquema, constraint SQL, validación y respuesta de API implementan el mismo contrato minimumEnrollment/minimo_inscritos.
- [ ] Ejecutar `npm test -- tests/course.rules.test.ts tests/course.update.test.ts` desde backend, generar cliente Prisma si procede y compilar backend. No aplicar migraciones a Supabase.
- [ ] Stage de los archivos explícitos y revisión de `git diff --cached`; crear el commit solo si las comprobaciones pasan.

## Task 3: Formulario y guardado de cursos

**Commit:** `fix(courses): completar formulario y evitar duplicados al reintentar`

**Files:** frontend/src/app/core/course.service.ts; frontend/src/app/features/courses/course-form/course-form.{ts,html,spec.ts}; frontend/src/app/features/courses/course-list/course-list.{ts,html,spec.ts}; frontend/src/app/features/courses/courses-page/courses-page.{ts,html,spec.ts}. Incluir únicamente estilos necesarios para controles nuevos; dejar tipografía y rediseño general para Task 7.

- [ ] Revisar selector de instructor, capacidad, mínimo de inscritos, fechas, categorías de precios y manejo de errores.
- [ ] Revisar protección contra doble envío y reintento después de fallo de precios.
- [ ] Ejecutar pruebas de course-form, course-list y courses-page con `npm test -- --watch=false` y filtros `--include` aceptados por el runner instalado; compilar frontend.
- [ ] Stage selectivo, revisión del diff y commit con sus pruebas.

## Task 4: Permisos y bloqueo de sesiones

**Commit:** `fix(sessions): bloquear cambios tras registrar asistencia del instructor`

**Files:** backend/src/modules/course-sessions/course-session.service.ts; backend/tests/course-session.{recurrence,routes,service}.test.ts; frontend/src/app/core/course-session.service.ts; frontend/src/app/features/course-sessions/course-sessions-page.{ts,html,spec.ts}. Estilos de bloqueo nuevos si son necesarios para este comportamiento.

- [ ] Verificar autorización para programar frente a editar/eliminar y consistencia de los locks transaccionales con asistencia del instructor.
- [ ] Ejecutar las tres pruebas backend de course-session y la prueba frontend de course-sessions-page; comprobar permisos ADMIN e INSTRUCTOR, sesión bloqueada y eliminación con asistencia.
- [ ] Revisar staging y crear el commit.

## Task 5: Asistencia de participantes

**Commit:** `feat(attendance): permitir marcar todos los alumnos presentes`

**Files:** frontend/src/app/features/attendance/attendance-page.{ts,html,spec.ts}. Añadir solo estilos que requieran los avisos nuevos.

- [ ] Revisar marcado masivo de todos los inscritos, incluidos búsqueda y otras páginas, fallos parciales y reintentos.
- [ ] Ejecutar attendance-page.spec.ts y comprobar permisos, sesiones futuras y ausencia de envíos duplicados.
- [ ] Revisar staging y crear el commit.

## Task 6: Asistencia de instructores

**Commit:** `fix(instructor-attendance): permitir registro fuera de fecha con avisos`

**Files:** backend/src/modules/instructor-attendance/instructor-attendance.service.ts; backend/tests/instructor-attendance.service.test.ts; frontend/src/app/features/instructor-attendance/instructor-attendance-page.{ts,html,spec.ts}. Añadir estilos necesarios para avisos.

- [ ] Verificar que los cambios existentes permiten al administrador registrar sesiones futuras y mantienen comprobaciones de instructor asignado y registro original.
- [ ] Ejecutar la prueba backend del servicio y la prueba frontend de página, incluidos orden y advertencias.
- [ ] Revisar staging y crear el commit.

## Task 7: Rediseño compartido

**Commit:** `style(ui): unificar tipografia y redisenar navegacion`

**Files:** frontend/src/styles.scss; frontend/src/app/app.{html,scss}; todos los cambios SCSS restantes en accounts, attendance, auth, course-sessions, courses, enrollments, instructor-attendance, participant-catalog y progress, incluido shared/participant-header.

- [ ] Agrupar variables tipográficas, iconos SVG, perfil del sidebar y ajustes visuales relacionados. Comprobar que no queda comportamiento funcional escondido en este grupo.
- [ ] Compilar frontend y revisar visualmente navegación por rol y layouts en escritorio/móvil sin modificar datos remotos.
- [ ] Revisar staging y crear el commit.

## Task 8: Documentación y archivo auxiliar

**Commit:** `docs: documentar agrupacion de correcciones de sprints`

**Files:** este plan y minimum-enrollment.patch si la revisión confirma que es un respaldo que debe versionarse para cumplir “todo lo que ya hay”.

- [ ] Documentar el propósito real del parche; si contiene cambios únicos, asignarlos primero al commit funcional correspondiente. Si contiene secretos, excluir esos contenidos y reportarlo antes de registrarlo.
- [ ] Conservar el archivo original en el checkout origen. Evitar presentar un parche redundante como implementación adicional.
- [ ] Revisar documentación y crear el commit.

## Task 9: Verificación final

- [ ] Ejecutar suite backend y frontend, más build de ambos, usando los scripts package.json del destino.
- [ ] Inspeccionar cada commit con `git show --stat` y revisar que depende solo de los anteriores. Verificar los commits intermedios con un checkout temporal cuando staging selectivo introduzca incertidumbre.
- [ ] Comparar el contenido final del destino con la captura original, salvo documentación añadida y correcciones justificadas por fallos reales.
- [ ] Confirmar worktree destino limpio y mostrar rama, hashes, mensajes y resultados de verificación. No afirmar que todo pasa sin ejecutar los checks.
- [ ] Mantener intacto el checkout origen y explicar que conserva sus cambios pendientes para evitar que el usuario los registre otra vez por error.

## Resultado de ejecución

Consultar docs/superpowers/reports/2026-10-13-correcciones-rediseno-sprints.md para hashes, comprobaciones y límites de la revisión visual. El acceso a clases de course-list se registró como commit independiente del formulario.
