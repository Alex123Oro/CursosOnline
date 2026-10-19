# Angular como Web Service en Render

Este servicio ejecuta un servidor Node independiente del backend Express. No requiere Express ni otras dependencias nuevas: `server.mjs` usa la biblioteca estándar de Node.

## Configuración del servicio nuevo

| Campo | Valor |
|---|---|
| Tipo | Web Service |
| Repositorio | `Alex123Oro/CursosOnline` (original, sin copia) |
| Rama | `main` |
| Root Directory | `frontend` |
| Runtime | Node |
| Build Command | `npm ci --include=dev && npm run build:deploy` |
| Start Command | `npm run start:render` |
| Health Check Path | `/` |
| Auto-Deploy | On Commit |
| Plan | Free, si está disponible; no contratar un plan de pago sin aprobación |

Variables de entorno:

- `API_BASE_URL=https://cursosonline-1cre.onrender.com/api` (pública, se inyecta al compilar).
- `NODE_VERSION=24` (Angular requiere una versión moderna de Node).
- `NODE_ENV=production`.
- No definir `PORT`: Render lo proporciona y el servidor lo escucha en `0.0.0.0`.

**No copiar claves de Supabase ni credenciales de base de datos al frontend.** Las peticiones de negocio siguen dirigidas al backend existente.

Antes de crear el servicio, los archivos de despliegue deben estar publicados en la rama configurada. Un despliegue desde Git no utiliza archivos locales sin subir.

## Comprobaciones

```powershell
npm run test:server
$env:API_BASE_URL='https://cursosonline-1cre.onrender.com/api'
npm run build:deploy
npm run start:render
```

El servidor entrega `dist/frontend/browser`, responde a HEAD y sirve `index.html` para enlaces profundos de Angular solicitados como HTML. No transforma en HTML los assets ausentes, las rutas `/api` ni archivos ocultos. Los módulos PDF se sirven como JavaScript.

Al publicar, comprobar `/catalogo`, `/iniciar-sesion`, `/verificar/8F72A91C`, imágenes y conexión con Render. Las acciones privadas requieren una sesión real; no emitir certificados de prueba en producción.

Cuando se decida que el nuevo dominio es el definitivo, cambiar `PUBLIC_APP_URL` en el backend a esa URL para los enlaces y QR de certificados. Mantener Cloudflare operativo hasta verificar el servicio nuevo.

## Particularidad del plan gratuito

Un Web Service gratuito puede suspenderse por inactividad: la primera visita puede tardar en despertar **el frontend y el backend**, porque son dos servicios. Un sitio estático evita el arranque del servidor del frontend, pero aquí se mantiene Web Service por petición del usuario.
