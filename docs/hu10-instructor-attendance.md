# HU-10 — Asistencia del instructor

Implementación del plan aprobado en conversación, basada en HU-10 de Eva:
https://app.notion.com/p/3e07951d53a1819c9e93c215a8739269

## Uso

Seleccionar **Ana Admin** en el selector de sesión y abrir **Asistencia de
instructores** desde el menú. El acceso desde Sesiones preselecciona instructor
y curso. El instructor y el participante no tienen acceso, incluso mediante API.

Para la prueba local:
http://localhost:4200/asistencia-instructores?instructor=5&course=22

El curso **Prueba HU-10 · Instructor**, código EVA-HU10-DEMO, contiene 10 clases
entre el 28 de septiembre y el 7 de octubre de 2026. Conserva marcas de prueba
y un registro histórico de otro instructor generado al verificar reasignación.
Estas marcas pueden corregirse; no corresponden a cursos reales.

Filtrar por curso, Desde/Hasta inclusivos y estado. Ocho sesiones por página,
fecha/hora descendente. Presente y Ausente se guardan automáticamente; el
resultado se muestra solo después de confirmación del servidor. Fallos conservan
la marca previa y permiten reintentar. Sesiones futuras están bloqueadas según
America/La_Paz. Pendientes no son ausencias automáticas. No hay porcentaje,
aprobación, sanciones ni regla del 80%.

## Integridad e historial

InstructorAttendance es independiente de Attendance de participantes.
Un registro por sesión, FK compuesta sesión/curso, instructor original,
administrador que registró la última marca y timestamps. Guardado con locks
curso→sesión y upsert dentro de una transacción.

Reasignar el curso conserva sus marcas anteriores; sesiones sin registro
corresponden al instructor actual. No se puede transferir una marca a otro
instructor. Las correcciones del instructor original siguen permitidas mientras
el curso tenga un usuario instructor asignado. Si se retira esa asignación, el
historial conserva el resumen pero se bloquea con una explicación. Borradores
no admiten operaciones de asistencia.

Cambiar contexto cancela lecturas y observadores de la vista; un PUT que ya
alcanzó el servidor puede completar. El servicio mantiene esa escritura y
notifica su finalización para reconciliar el historial actual. Esto evita
mostrar permanentemente una lectura antigua cuando el PUT termina después.

## Contrato

- GET `/api/admin/instructors`: usuarios instructores y usuarios con historial.
- GET `/api/admin/instructors/:instructorId/attendance`: instructor, cursos,
  sesiones y resumen; filtros opcionales `courseId`, `from`, `to`.
- PUT `/api/admin/instructors/:instructorId/sessions/:sessionId/attendance`:
  `{ status: 'PRESENT' | 'ABSENT' }`, respuesta 200 con fila actualizada.

IDs string, fechas YYYY-MM-DD, 400 datos/reglas inválidos, 401 sin identidad,
403 rol no autorizado, 404 recurso inexistente, 409 transferencia de una marca.
Se conserva el mecanismo X-User-Id existente.

## Base local y verificación

Respaldo previo completo:
`C:/Users/bruno/AppData/Local/Temp/eva-hu10-before-20261006.dump`.
Migración aditiva aplicada por db execute; prisma generate y comparación de
esquema sin diferencias. Sin reset ni cambios en el historial desalineado.
No repetir el SQL sobre una base donde la tabla ya existe.

En backend, `npm run prisma:seed:instructor-attendance-demo` prepara únicamente
datos demo en una base local y conserva marcas/cursos existentes. Las fechas
se calculan respecto al día de ejecución; no es parte del seed general.

Verificación final: backend **151/151**; frontend **50/51**, incluidas las 10
pruebas del panel y el acceso contextual desde Sesiones. El fallo restante es
previo: ParticipantCourseDetailPage espera «Nota mínima de 70/100».
Ambos builds correctos; permanecen advertencias anteriores de CSS en sesiones
y catálogo. No se cambiaron pruebas del catálogo para ocultar ese fallo.

Integración real: roles, guardado/corrección, unicidad con solicitudes
simultáneas, filtros inclusivos, futuras, borradores, curso sin asignación,
reasignación e historial original, rechazo de transferencia, FK de curso/sesión
y registros HU-09 conservados. Navegador: acceso admin, rechazo instructor,
guardado y recarga, fechas, paginación, móvil y escritorio. Revisión
independiente completada; hallazgos corregidos y verificados.

Cambios separados en commits de datos, API, coherencia de bloqueo, interfaz
y documentación/datos de demostración. Sin cambios en Notion.
