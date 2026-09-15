# Entornos Virtuales

Aplicacion web con un frontend Angular, un backend Express/TypeScript y Supabase como servicio de datos y autenticacion.

## Requisitos

- Node.js compatible con las versiones actuales de Angular y TypeScript.
- npm.
- Una cuenta y un proyecto de Supabase.

Comprueba las herramientas instaladas:

```bash
node --version
npm --version
```

## Estructura

```text
backend/    API Express y conexion con Supabase
frontend/   Aplicacion Angular
```

## Configurar Supabase

1. Entra en la carpeta del backend.
2. Crea el archivo `.env` a partir de `.env.example`.

En PowerShell:

```powershell
cd backend
Copy-Item .env.example .env
```

En macOS/Linux:

```bash
cd backend
cp .env.example .env
```

3. Edita `backend/.env` y sustituye los valores de ejemplo:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_PUBLISHABLE_KEY=tu-clave-publicable
SUPABASE_SECRET_KEY=tu-clave-secreta
SUPABASE_JWKS_URL=https://tu-proyecto.supabase.co/auth/v1/.well-known/jwks.json
PUERTO=3000
```

No publiques `.env` ni compartas `SUPABASE_SECRET_KEY`. Esta clave solo debe utilizarse en el backend.

## Instalar dependencias

Ejecuta la instalacion en cada aplicacion:

```bash
cd backend
npm install

cd ../frontend
npm install
```

## Ejecutar en desarrollo

Abre dos terminales.

### Backend

```bash
cd backend
npm run dev
```

El backend quedara disponible en `http://localhost:3000`.

### Frontend

En la segunda terminal:

```bash
cd frontend
npm start
```

La aplicacion Angular quedara disponible en `http://localhost:4200`.

## Comprobar la conexion con Supabase

Con el backend en ejecucion, visita o consulta:

```text
http://localhost:3000/api/health
http://localhost:3000/api/supabase/health
```

La respuesta esperada para la comprobacion de Supabase es:

```json
{"ok":true,"servicio":"supabase"}
```

## Comandos del backend

Desde `backend`:

```bash
npm run dev    # desarrollo con recarga automatica
npm run build  # compilar TypeScript en dist/
npm start      # ejecutar la compilacion de dist/
```

## Comandos del frontend

Desde `frontend`:

```bash
npm start  # servidor de desarrollo
npm run build
npm test
```

## Problemas frecuentes

### `npm run dev` no encuentra el script

El comando debe ejecutarse dentro de `backend`, no en la raiz del proyecto:

```bash
cd backend
npm run dev
```

### Faltan variables de entorno

Comprueba que existe `backend/.env` y que contiene `SUPABASE_URL` y `SUPABASE_SECRET_KEY` con valores validos.

### El puerto 3000 esta ocupado

Cambia `PUERTO` en `backend/.env` y vuelve a iniciar el backend.

### El puerto 4200 esta ocupado

Puedes iniciar Angular en otro puerto:

```bash
cd frontend
npm start -- --port 4201
```
