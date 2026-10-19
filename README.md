# EVA â€” GestiÃ³n de FormaciÃ³n Continua

EVA es una aplicaciÃ³n web para gestionar cursos de formaciÃ³n continua del Laboratorio de InformÃ¡tica: cursos, preinscripciones, inscripciones, asistencia, evaluaciones y certificados verificables.

## TecnologÃ­as

- Frontend: Angular + TypeScript
- Backend: Node.js + Express + TypeScript
- Datos y autenticaciÃ³n: Supabase

## Estado actual

El proyecto cuenta con la estructura inicial de Angular y Express, ademÃ¡s de la conexiÃ³n con Supabase. Las funcionalidades del sistema EVA se encuentran en desarrollo.

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

El frontend estarÃ¡ disponible en `http://localhost:4200` y el backend en `http://localhost:3000`.

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

## Actualizar una base existente con los cambios de Sprint 4

En `backend`, ejecuta:

```bash
npm run build
npm run academic:check
npm run academic:apply
```

El arranque y la compilación regeneran automáticamente el cliente de Prisma.
`academic:check` valida la migración y revierte la transacción; `academic:apply`
la aplica. Ambos comprueban que los certificados y sus resultados conserven sus
datos. La migración copia las asignaciones de instructores existentes y crea
`resultados_academicos_curso` para recalcular resultados sin modificar
`resultados_curso`, que pertenece a la emisión de certificados.

Este script aplica únicamente la migración de gestión académica y se puede
repetir. Úsalo para la base existente, cuyo historial de Prisma es anterior a
estas tablas; no requiere reiniciar la base ni reproducir migraciones antiguas.

## Estructura

```text
backend/    API Express y conexiÃ³n con Supabase
frontend/   AplicaciÃ³n Angular
```
