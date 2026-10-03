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
