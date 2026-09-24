# Catálogo de cursos para participantes

## Objetivo

Incorporar una pantalla pública para que una persona participante explore cursos disponibles sin depender todavía del backend. La administración existente se mantiene en `/cursos` y la ruta raíz continuará redirigiendo a esa pantalla.

## Alcance y navegación

- Añadir la ruta pública y directa `/catalogo`, con el título `Cursos disponibles | EVA`.
- Mantener `/` → `/cursos` y el layout de administración sin cambios funcionales.
- La ruta pública renderiza su propio encabezado y no muestra el sidebar de administración.
- No se añade aún inscripción, detalle de curso, autenticación ni llamadas HTTP. Los botones de cada tarjeta son controles visuales deshabilitados o de demostración hasta que exista su flujo.

## Interfaz

La página tendrá un encabezado compacto con la identidad EVA y un enlace visible a la oferta de cursos. El contenido principal incluye:

1. Un bloque introductorio con el título “Encuentra tu próximo curso” y una explicación breve.
2. Un campo de búsqueda etiquetado para filtrar por nombre, código o instructor.
3. Filtros de área como botones de selección, que permitan volver a “Todos”.
4. Un contador textual de resultados y una cuadrícula de tarjetas.
5. En cada tarjeta: área, título, código, descripción, duración, instructor, horario y botón “Ver detalles”.
6. Un estado vacío claro cuando no haya coincidencias, con una acción para limpiar los filtros.

Los cursos serán un arreglo local de cursos publicados de ejemplo. La futura integración podrá sustituir ese arreglo por `CourseService.catalog()` sin cambiar el contrato de presentación.

## Diseño visual y UX

Se conserva el sistema visual presente en el frontend: superficies blancas sobre fondo verde muy claro, verde oscuro para textos, teal para acciones, bordes suaves y la tipografía Manrope cuando esté disponible. Se aplica una escala de espaciado de 8 px, contenido centrado y tarjetas de altura estable.

La primera versión es responsive: tres tarjetas en escritorio, dos en tamaño intermedio y una en móvil; los filtros se ajustan en varias filas, sin desplazamiento horizontal. Los controles usan elementos HTML nativos, etiquetas visibles, contraste suficiente, foco de teclado visible, `aria-live` para el conteo de resultados y no dependen solo del color para expresar estado. Las transiciones se limitan a `opacity` y `transform`, y se desactivan con `prefers-reduced-motion`.

## Componentes y flujo de datos

- `ParticipantCatalogPage`: mantiene `query` y `selectedArea` como signals y expone `filteredCourses` como `computed`.
- `participant-catalog.data.ts`: contiene el tipo de vista y los cursos locales para que la información de demostración no quede mezclada con el componente.
- La plantilla usa `@for` con `track course.id` y muestra el estado vacío desde el mismo resultado calculado.
- `App`: elegirá el layout según la ruta activa para no envolver el catálogo público en el sidebar de administración.

## Pruebas y verificación

- Prueba de componente: filtrar por búsqueda y área actualiza las tarjetas y el contador.
- Prueba de componente: al no coincidir la búsqueda se muestra el estado vacío y se puede limpiar.
- Prueba de rutas: `/catalogo` resuelve la pantalla pública y `/` mantiene la redirección a `/cursos`.
- Ejecutar las pruebas de frontend y `npm run build`.
- Revisar manualmente las dimensiones 375 px, 768 px, 1024 px y 1440 px, foco de teclado y movimiento reducido.
