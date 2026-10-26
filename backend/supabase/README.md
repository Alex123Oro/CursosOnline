# Demo de certificados con Supabase local

Entorno Docker independiente `cursosonline-certificates`, en la rama `develop` de la carpeta original. Incluye PostgreSQL 17, Auth, Data API, Studio, Storage, Realtime y un buzón de correo local. La CLI oficial está fijada en `2.122.0` en `backend/package.json`. Analytics, Edge Runtime y almacenamiento vectorial quedan deshabilitados porque la demo no los usa.

## Acceso

| Servicio | Dirección |
|---|---|
| Aplicación Angular | http://localhost:4200 |
| Backend | http://localhost:3000/api/health |
| Comprobación de conexión | http://localhost:3000/api/supabase/health |
| Supabase API | http://127.0.0.1:54321 |
| PostgreSQL | `127.0.0.1:54322`, base `postgres` |
| Supabase Studio | http://127.0.0.1:54323 |
| Buzón local de pruebas | http://127.0.0.1:54324 |

Los contenedores `eva-postgres` y `proyecto-grado-postgres` no forman parte de este entorno y no se modifican.

Administrador: `s3.cert.admin@example.com`. Participante con PDF emitido: `s3.cert.p07@example.com`. Todas las cuentas demo usan el valor de `CERTIFICATES_DEMO_PASSWORD` en `backend/.local/certificates-docker/local.env`. La contraseña fue generada localmente; no se imprime ni se versiona. Ver el resto de cuentas y el guion en [Certificates Module](../prisma/Certificates%20Module/README.md).

## Arrancar y detener

Desde `backend`, con Docker Desktop activo y dependencias instaladas:

```powershell
npm run local:up
npm run local:use
npm run local:status
npm run dev
```

En otra terminal, desde `frontend`:

```powershell
npm start
```

Para detener únicamente Supabase de esta demo, conservando datos:

```powershell
npm run local:down
```

`local:up` restaura los contenedores y sus datos. `local:down` usa `supabase stop --project-id cursosonline-certificates`, sin `--no-backup` ni `--all`. No ejecutar comandos de eliminación de volúmenes o `db reset` para reiniciar la demo: eso borraría sus datos y dejaría inválido el manifiesto. El arranque verifica los checksums de las migraciones iniciales.

El backend y frontend se ejecutan en Windows, fuera de Docker. Deben reiniciarse si se cambia su configuración. Los procesos arrancados durante la preparación guardan logs en `backend/.local/certificates-docker/`.

## Instalación nueva en otra copia

1. Ejecutar `npm ci` en `backend` y `frontend`.
2. Desde `backend`, ejecutar `npm run local:up`. Los puertos `54320`–`54324` deben estar disponibles; no detener otros proyectos para liberarlos sin revisarlos. El proyecto usa los volúmenes administrados por la CLI.
3. Ejecutar `npm run local:configure`: obtiene las claves y conexión del estado local, guarda la configuración previa como `backend/.local/certificates-docker/remote.env` si aún no existe, genera `local.env` y activa esa copia en `backend/.env`. No sobrescribe una copia remota previa. Si no hay `.env`, preparar primero la configuración remota que se desee conservar.
4. Ejecutar `npm run prisma:generate` y `npm run prisma:seed` para inicializar el catálogo. Confirmar con `npm run local:status` que el destino activo sea `local`.
5. Ejecutar `npm run certificates:check` y después `npm run certificates:seed`.
6. Arrancar backend/frontend y ejecutar `npm run certificates:verify` antes de modificar escenarios durante la presentación.

No usar `prisma migrate deploy`, `prisma migrate dev` ni las migraciones históricas para construir este entorno vacío: presuponen un esquema anterior que no está incluido en su primera migración. Este proyecto local tiene su propia base inicial y su historial en `supabase_migrations.schema_migrations`.

## Estructura inicial y permisos

`migrations/20261026184509_certificates_local_baseline.sql` procede de una exportación de **solo la estructura de `public`**, sin filas ni cuentas Auth. Incluye funciones, triggers, restricciones, índices, políticas RLS y permisos de objetos. El trigger de registro ligado a `auth.users` se añade expresamente, porque una exportación exclusiva de `public` no incluye triggers ligados a otro esquema.

La normalización omite instrucciones de `psql` y cambios de permisos predeterminados del rol administrador de la nube que no se pueden aplicar con el usuario local. La migración se niega a importar sobre un esquema donde ya existan `usuarios` o `cursos`.

`migrations/20261026185150_local_acl_compatibility.sql` elimina permisos implícitos añadidos por los valores predeterminados locales y restaura los permisos explícitos exportados de la nube. No cambia reglas de negocio ni registros. La configuración deshabilita la exposición automática de tablas nuevas; las concesiones quedan explícitas. Las funciones de emisión quedan restringidas al backend mediante `service_role`, como en el origen.

`baseline.json` registra versión, procedencia, normalización y hashes SHA-256 de ambas migraciones. No se copiaron datos de usuarios, cursos, certificados, archivos Storage ni cuentas del proyecto remoto. Las cuentas de la demo se crean mediante la API administrativa del Auth local.

## Seeds y persistencia

El estado inicial incluye 14 perfiles/cuentas confirmadas, cuatro cursos, 15 inscripciones, dos plantillas y cinco certificados: tres válidos y dos anulados. Sesiones, evaluaciones, calificaciones y asistencias permiten recorrer los casos pendientes de emisión.

El manifiesto de esta instancia está en `backend/.local/certificates-module-local/manifest.json`; el remoto usa otra carpeta. Repetir `npm run certificates:seed` valida la carga existente sin duplicarla ni restaurar los cambios de la demo. Conservar el manifiesto y los volúmenes juntos. El curso en desarrollo tiene sesiones hasta tres días después de la carga inicial; su condición cambia con el calendario.

Pruebas sin acceso a Supabase:

```powershell
npx vitest run "prisma/Certificates Module"
npx tsc -p "prisma/Certificates Module/tsconfig.json"
```

`npm run certificates:verify` comprueba login, candidatos y bloqueos, historial, estados, propiedad, verificación pública y PDF contra el backend activo. No consume las emisiones pendientes. Abre y cierra sesiones temporales. Durante la preparación se comprobó también la interfaz y la descarga de un PDF, la repetición sin duplicados y la persistencia tras detener y arrancar el entorno.

## Volver al proyecto remoto

Detener el backend y ejecutar desde `backend`:

```powershell
npm run remote:use
```

Esto restaura exactamente la configuración previa desde `backend/.local/certificates-docker/remote.env`, sin ejecutar ningún seed. Revisar el puerto restaurado antes de reiniciar el backend: la copia original puede usar un puerto distinto de `3000`, y debe coincidir con el frontend. Para volver a esta demo, detener el backend, ejecutar `npm run local:use` y arrancarlo otra vez.

Las copias privadas, logs, manifiestos y capturas quedan bajo `.local/`, ignorado por Git. El script de estado muestra solo direcciones y destino, no claves ni contraseñas. No usar `supabase link` ni comandos de despliegue remoto para este entorno local.
