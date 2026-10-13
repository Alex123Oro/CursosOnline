# Registro de correcciones y rediseño

Rama: `codex/correcciones-rediseno-sprints`, creada desde `develop` en `2e9b266`.

Se copiaron los 51 archivos modificados o nuevos de la carpeta principal al worktree de este chat. La comparación SHA256 confirmó que el resultado conserva exactamente su contenido. La carpeta principal permanece en `develop` con sus cambios pendientes originales; no volver a registrarlos como si fueran trabajo adicional sin comparar esta rama.

## Commits funcionales y visuales

| Commit | Propósito |
|---|---|
| baf0cc7 | Mínimo de inscritos: esquema, migración, API, validaciones y pruebas. |
| 4aac6cc | Formulario completo y reintento de guardado sin duplicar cursos. |
| 2015eb0 | Acceso a clases desde cursos publicados. |
| 6525afb | Permisos y bloqueo de edición/eliminación tras asistencia del instructor. |
| bf0a574 | Marcar todos los alumnos presentes, incluidos filtros y otras páginas. |
| 073dbdf | Registro de asistencia de instructores fuera de fecha con advertencias. |
| d45656f | Tipografía compartida, iconos SVG, navegación y estilos de páginas. |

Cada grupo se aplicó y probó sobre los commits anteriores, antes de registrar el siguiente. Los estilos necesarios del formulario y del botón de asistencia masiva acompañan sus commits funcionales; las variables tipográficas y sus consumidores quedan juntos en el commit visual.

## Ajustes al plan

- La asistencia de participantes añade marcado masivo; se corrigió la descripción inicial que la asociaba a orden y advertencias.
- El enlace de clases es independiente del formulario y tiene su propio commit.
- Se registró implementación existente; no se borró ni reimplementó para recrear una secuencia TDD.
- Git y algunas verificaciones necesitaron acceso fuera del sandbox por metadatos compartidos y errores de permisos/proceso nativo. No se escribieron archivos fuente del checkout principal.

## Verificación

- Base: backend 170 pruebas y frontend 73 pruebas aprobadas.
- Resultado: backend 183 pruebas en 17 archivos y frontend 91 pruebas en 20 archivos aprobadas.
- Compilación TypeScript del backend y compilación de producción Angular aprobadas.
- Revisión independiente de solo lectura: sin hallazgos accionables dentro del alcance de registrar los cambios existentes y conservar su contenido.
- Cliente Prisma generado localmente; no se aplicaron migraciones ni se ejecutaron semillas.
- Revisión visual del login compilado en escritorio y móvil, sin desbordamiento horizontal. El catálogo renderizó su estado de error al no disponer de API. No se comprobó visualmente la navegación autenticada ni la integración con una base remota.
- Angular advierte de presupuestos de tamaño: bundle inicial 505.42 kB frente a 500 kB y estilos de algunas páginas por encima de 4 kB. No son errores de compilación; sesiones alcanza 7.81 kB, cerca del límite de error de 8 kB.

## Parche conservado

`minimum-enrollment.patch` es un respaldo redundante de diez archivos relacionados con el mínimo de inscritos y el formulario. La comprobación inversa `git apply --reverse --check --ignore-space-change minimum-enrollment.patch` pasó contra el resultado final. Se conserva sin volver a aplicarlo, para incluir el archivo preexistente solicitado por el usuario. No se encontraron indicadores de credenciales en su contenido.

No se hizo push, merge, despliegue ni modificación de datos remotos.
