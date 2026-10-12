# Interfaz por perfil

La entrada `/cursos` muestra la administración a ADMIN y Mis cursos a INSTRUCTOR. `/mis-cursos` redirige a `/cursos`. Los participantes conservan catálogo y preinscripciones. Marta Docente mantiene su rol PARTICIPANT.

El selector agrupa los cuatro usuarios iniciales y todos los instructores; excluye alumnos adicionales de prueba. Conserva la selección al recargar. Cambiar de identidad desde cualquiera de los selectores limpia la vista anterior y lleva a Cursos o Catálogo según el rol. Los guards esperan la carga inicial y conservan enlaces profundos permitidos.

Mis cursos ofrece búsqueda por nombre/código, fechas y ocho cursos por página, con enlaces a clases y asistencia de alumnos. La agenda del instructor es de consulta; Ver asistencia selecciona la clase en HU-09. Las clases futuras conservan su bloqueo. ADMIN conserva programación semanal, creación y edición.

## Permisos

Las rutas y servicios de creación, programación recurrente y edición de sesiones exigen ADMIN. El instructor consulta sesiones y gestiona asistencia de alumnos exclusivamente en sus cursos publicados. HU-10 e inscripciones siguen siendo exclusivos de ADMIN. Se mantiene X-User-Id. No hay cambios de esquema, migraciones ni asignaciones.

## Verificación

- Backend: 154 pruebas aprobadas y compilación correcta.
- Frontend: 59 pruebas aprobadas de 60. Continúa el fallo previo `ParticipantCourseDetailPage > shows all available public course information`, que espera el texto `Nota mínima de 70/100`. No se modificó el catálogo para ocultar ese fallo.
- Compilación frontend correcta. Continúan avisos de presupuesto SCSS de sesiones (7,02 kB) y catálogo (5,66 kB); no superan el límite de error.
- API local: instructor recibe 200 en cursos asignados y consulta de sesiones; 403 en POST de sesión, POST de programación, PUT de sesión y consulta administrativa de instructores.
- Navegador: Carla ve sus tres cursos; agenda sin edición y acceso a asistencia con sesión seleccionada. Se verificó guardar/corregir/recargar una marca de Ana Álvarez en el curso de prueba HU-09 y se restauró Presente. Las sesiones futuras están bloqueadas.
- Acceso directo a Inscripciones con instructor redirige a Cursos. Identidad persiste al recargar. Cambiar a Marta muestra catálogo; cambiar desde su selector público a Ana muestra administración completa.
- Diseño comprobado en móvil y escritorio, con controles de 44 px, foco visible y sin desbordamiento horizontal observado.
- Pruebas cubren paginación/búsqueda, carga de identidad, selector, cancelación al cambiar instructor, reintento, navegación de perfiles y ausencia de escrituras de sesiones desde instructor.

## Probar

Abrir http://localhost:4200/cursos y seleccionar Ing. Carla Mendoza. Usar Ver clases y Ver asistencia, o Asistencia de alumnos. Cambiar a Ana Admin para comprobar que conserva las funciones administrativas. Los datos locales HU-09/HU-10 permiten probar las asistencias. El servidor frontend se inició con `npm start -- --host localhost --port 4200 --poll 1000` para detectar cambios en OneDrive.
