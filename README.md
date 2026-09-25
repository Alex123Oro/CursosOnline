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

## Estructura

```text
backend/    API Express y conexión con Supabase
frontend/   Aplicación Angular
```
