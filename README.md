# EVA — Gestión de Formación Continua

EVA es una aplicación web para gestionar cursos de formación continua del Laboratorio de Informática: cursos, preinscripciones, inscripciones, asistencia, evaluaciones y certificados verificables.

## Tecnologías

- Frontend: Angular + TypeScript
- Backend: Node.js + Express + TypeScript
- Datos y autenticación: Supabase

## Estado actual

El proyecto cuenta con la estructura inicial de Angular y Express, además de la conexión con Supabase. Las funcionalidades del sistema EVA se encuentran en desarrollo.

## Ejecutar el proyecto

Instala las dependencias:

```bash
cd backend
npm install

cd ../frontend
npm install
```

En `backend`, crea un archivo `.env` a partir de `.env.example` y configura las credenciales de Supabase.

Inicia el backend:

```bash
cd backend
npm run dev
```

Inicia el frontend en otra terminal:

```bash
cd frontend
npm start
```

El frontend estará disponible en `http://localhost:4200` y el backend en `http://localhost:3000`.

## Ejecutar en produccion

Compila el frontend y el backend, y luego inicia Express:

```bash
cd frontend
npm run build
cd ../backend
npm run build
npm start
```

Abre `http://localhost:3000` (o el puerto configurado en `PUERTO`). Express sirve
`frontend/dist/frontend/browser` y la API desde el mismo origen, por lo que
la URL `/api` del frontend de produccion funciona sin un proxy adicional.
Conserva ambas carpetas al desplegar. Las rutas de Angular tambien se sirven
desde `index.html` al recargar la pagina.

## Estructura

```text
backend/    API Express y conexión con Supabase
frontend/   Aplicación Angular
```

## HU-08: sesiones e instructores

Un administrador puede abrir **Sesiones** desde un curso publicado. El instructor
puede usar **Mis cursos** para administrar únicamente las sesiones de sus cursos
asignados. El formulario permite registrar o editar fecha, hora local de Bolivia
y duración en minutos. Una fecha fuera del periodo del curso muestra una
advertencia y permite guardar. No se permite terminar al día siguiente ni duplicar
la fecha y hora de inicio en el mismo curso.

**Programar sesiones** permite elegir inicio, fin inclusivo y días de la semana,
con una misma hora y duración para todas las clases. La vista previa distingue
las fechas nuevas, las que están fuera del periodo y las que ya existen. El
guardado conjunto omite coincidencias exactas de fecha y hora, sin modificar las
clases existentes. Cada clase se puede editar individualmente; también se puede
registrar una sola clase. Se permiten hasta 366 días por programación.

En el formulario del curso, **Usuario instructor asignado** vincula un usuario
con rol `INSTRUCTOR` y actualiza el nombre del instructor. Los cursos existentes
con nombre manual siguen disponibles para el administrador.

Para la base local ya sincronizada con el esquema del Sprint 2, hacer un respaldo
antes de aplicar esta migración aditiva desde `backend`:

```powershell
npx prisma db execute --file prisma/migrations/20261006010000_course_sessions/migration.sql --schema prisma/schema.prisma
npm run prisma:generate
npm run prisma:seed:instructors
```

La migración se aplica **una sola vez**. Si Prisma no puede regenerar el motor en
Windows, detener el backend y volver a ejecutarlo después de generar el cliente.
El seed incremental agrega seis instructores de prueba y vincula cursos cuyo
nombre de instructor coincide exactamente y que todavía no tienen usuario
asignado; no reemplaza cursos, precios ni inscripciones. El seed completo
`npm run prisma:seed` también incorpora estos instructores, pero actualiza los
cursos y precios de ejemplo como antes.

Las migraciones históricas requieren una estructura previa distinta; estos
comandos no inicializan una base vacía ni corrigen su historial. No ejecutar
`migrate reset` ni marcar migraciones históricas como aplicadas sin revisarlas.

Para probar, seleccionar **Ing. Carla Mendoza** en el selector de sesión y abrir
**Mis cursos**. Este entorno mantiene la selección de usuario con `X-User-Id`;
no agrega un sistema de inicio de sesión nuevo.

La API incorpora `GET /api/teaching/courses` y `GET`/`POST`
`/api/courses/:courseId/sessions`, además de `PUT`
`/api/courses/:courseId/sessions/:sessionId`. Crear o editar recibe
`{ date: "YYYY-MM-DD", startTime: "HH:mm", durationMinutes: number }`.

`POST /api/courses/:courseId/sessions/schedule` recibe
`{ startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", weekdays: number[], startTime: "HH:mm", durationMinutes: number }`.
Los días van de `0` (domingo) a `6` (sábado). Devuelve `201` con
`{ createdCount, skippedCount, sessions }`, donde `sessions` es la agenda
actualizada del curso. La programación semanal usa las tablas existentes y no
requiere otra migración.
