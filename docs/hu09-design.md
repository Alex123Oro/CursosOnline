# HU-09: asistencia de participantes

Diseño aprobado en conversación el 6 de octubre de 2026, basado en HU-09,
Proyecto EVA y las decisiones del usuario.

## Comportamiento

Desde Mis cursos o Sesiones se abre Asistencia del curso. Se elige una sesión
programada y se muestra únicamente la lista oficial (INSCRITO), con nombre,
Presente/Ausente, porcentaje y clases anteriores pendientes. Los alumnos
inicialmente están sin marcar; no se crean ausencias automáticamente.

Cada cambio se guarda inmediatamente y puede corregirse. Durante la solicitud
se bloquea esa fila. Guardando/Guardado/Error indican el resultado real; un
error conserva el dato previo y ofrece reintentar la elección. Cambiar sesión,
curso o usuario cancela solicitudes y limpia datos anteriores. Un cambio que
alcanzó el servidor se recupera al recargar.

Se permiten hoy y fechas anteriores según America/La_Paz. El backend prohíbe
sesiones futuras, preinscritos, alumnos de otro curso y usuarios sin acceso.
Instructor asignado y administrador pueden gestionar cursos publicados.

El porcentaje es presentes / (presentes + ausentes) * 100, con un decimal.
Clases pasadas sin registro se muestran como pendientes; futuras no afectan
el porcentaje ni los pendientes. Cero registros produce porcentaje null y
el texto Sin registros. La aprobación y certificación (HU-12) no se implementan.

## Persistencia y contrato

Attendance vincula sesión e inscripción, con estado, usuario que guardó la
última marca y timestamps. Un índice único (sesión, inscripción) evita
duplicados. Relaciones compuestas comprueban también que ambas pertenecen
al mismo curso. Las correcciones actualizan el mismo registro.

GET /api/courses/:courseId/attendance devuelve curso, fecha local, sesiones,
alumnos inscritos y sus registros/resúmenes. PUT
/api/courses/:courseId/sessions/:sessionId/attendance/:enrollmentId recibe
{ status: PRESENT | ABSENT } y devuelve el resumen actualizado del alumno.
Identificadores string y errores 400/401/403/404 siguen el contrato actual.

Cada escritura valida y bloquea curso, sesión e inscripción dentro de una
transacción, antes de upsert. Dos clientes que corrigen la misma marca conservan
un único registro; prevalece la última escritura completada.

## Interfaz

Conservar colores teal, tipografía y navegación de EVA. Lista compacta y
paginada, búsqueda por nombre, selector de sesión con fecha/horario, avisos de
sesión futura y lista vacía. Controles accesibles, foco visible y 44px mínimos.
Mostrar porcentaje con el denominador y pendientes para evitar interpretarlo
como resultado final. Evitar tarjetas grandes o información económica.

## Implementación y commits

1. Datos: respaldo local y migración aditiva revisada; db execute y generate,
   sin reset ni modificar el historial desalineado. Commit de esquema/migración.
2. API: reglas, autorización, consulta y guardado, con pruebas de validación,
   porcentaje, fechas, aislamiento por curso y duplicados. Commit backend.
3. UI: servicio, ruta, panel, accesos y pruebas de autosave, error, cambio de
   sesión/identidad y paginación. Commit frontend.
4. Verificación: suites y compilaciones, prueba contra base y navegador,
   documentación de uso y entrega para prueba del usuario.

## Validación

Prueba 3 presentes + 1 ausente + 2 pendientes = 75%. Comprobar hoy en Bolivia
cerca de medianoche UTC; rechazar futuros, preinscritos y otro instructor.
Guardar, corregir y recargar; verificar un solo registro. Simular error y
reintentar sin mostrar éxito falso. Probar móvil y escritorio. Conservar cursos,
sesiones e inscripciones existentes; usar datos locales de prueba identificados.
