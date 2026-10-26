# Demo del módulo de certificados · Sprint 3

Paquete independiente. Su primera entrega no se ejecutó; posteriormente se autorizó y realizó la carga únicamente en Supabase local Docker. No está conectado al seed general, al arranque ni a las migraciones. Crea datos ficticios propios; no restaura ni elimina información existente. Ver [entorno Docker local](../../supabase/README.md) para arranque, credenciales y cambio de entorno.

## Preparación

Ejecutar los comandos desde `backend`. `seed.ts` y `verify.ts` cargan explícitamente `backend/.env`, aunque se invoquen desde otro directorio. Las variables ya definidas en el proceso tienen precedencia, como en dotenv.

Requisitos: dependencias instaladas, cliente Prisma generado, esquema del proyecto actualizado por separado, catálogo `Externo` disponible y backend/frontend configurados contra el mismo proyecto. La comprobación verifica columnas, funciones de emisión/anulación/reemisión, acceso a PostgreSQL, Data API y Supabase Auth. No aplica migraciones ni cambia permisos.

Variables en `backend/.env` (ignorado por Git):

- `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`: credenciales reales del mismo proyecto. PostgreSQL debe apuntar a la base `postgres`, sin parámetro `schema` o con `schema=public`, donde operan las funciones del módulo. Si existe `DIRECT_URL`, también debe corresponder a ese proyecto, base y esquema.
- `PUBLIC_APP_URL`: origen del frontend de la demo, por ejemplo `http://localhost:4200`, sin rutas, query ni fragmentos. Si `NODE_ENV=production`, debe usar HTTPS, igual que el módulo.
- `CERTIFICATES_DEMO_PASSWORD`: contraseña propia de la demo, al menos 12 caracteres, necesaria para cargar y verificar con sesiones. No incluirla en el código ni pasarla en la línea de comandos. Supabase puede exigir además su política de contraseñas.
- `PUERTO`: puerto del backend; el frontend debe apuntar a él. El verificador usa `http://localhost:PUERTO/api` (3000 por defecto).
- `CERTIFICATES_DEMO_TARGET=local`: habilita exclusivamente la API de loopback en `54321` y PostgreSQL de loopback en `54322`, base `postgres`. Sin esta selección explícita, se mantienen las comprobaciones de proyecto remoto. Se rechazan destinos mezclados. El manifiesto local se guarda en `.local/certificates-module-local/manifest.json`, separado del remoto.

No configurar `PDF_SIGNING_P12_PATH`; `PDF_SIGNING_DEMO` debe estar ausente o ser `false`. Se conserva el aviso del producto de firma criptográfica pendiente. Las plantillas contienen texto de demostración; no se genera un certificado institucional.

### Comprobar sin cargar

```powershell
npx tsx "prisma/Certificates Module/seed.ts"
```

Consulta configuración, estructura y colisiones. No crea cuentas, registros, sesiones ni manifiesto. Si ya existe una carga completa, valida sus referencias sin reiniciar la demo. No exige contraseña para esta comprobación.

### Cargar más adelante, explícitamente

**Este comando escribe en el proyecto configurado. La carga de Docker ya se ejecutó con el destino local; no se ha cargado el proyecto remoto.**

```powershell
npx tsx "prisma/Certificates Module/seed.ts" --apply
```

Desde la raíz del repositorio se puede usar el ejecutable local:

```powershell
& "./backend/node_modules/.bin/tsx.cmd" "./backend/prisma/Certificates Module/seed.ts" --apply
```

La carga crea 14 cuentas confirmadas en Auth y una transacción PostgreSQL para perfiles, cuatro cursos, 15 inscripciones, sesiones, notas, asistencias, dos plantillas y cinco certificados. Los precios son cero; no se crean pagos ni trámites financieros innecesarios. El instructor queda asignado a los cursos y registra notas/asistencias. La categoría de los participantes es `Externo`.

Las fechas se calculan desde el día de la primera carga en `America/La_Paz`. Los cursos finalizados terminan cinco días antes; el curso en desarrollo termina tres días después. Todos usan el prefijo `DEMO-S3-CERT-` y el texto `DEMOSTRACION SIN VALIDEZ ACADEMICA`.

## Cuentas y casos

Todas las cuentas usan la contraseña suministrada en `CERTIFICATES_DEMO_PASSWORD`. Son cuentas confirmadas y exclusivas de esta demo; no reciben correos de confirmación.

| Correo | Rol o caso |
|---|---|
| `s3.cert.admin@example.com` | Administrador: emisión, lote, plantillas, anulación y reemisión |
| `s3.cert.instructor@example.com` | Instructor: comprobar restricción de administración de certificados |
| `s3.cert.p01@example.com` | Ana: emisión individual; nota 90, asistencia 100 % |
| `s3.cert.p02@example.com` | Bruno: mínimo exacto; nota 70, asistencia 80 % |
| `s3.cert.p03@example.com` | Carla: emisión por lote; nota 85, asistencia 100 % |
| `s3.cert.p04@example.com` | Diego: nota 60, asistencia 100 %; solo participación |
| `s3.cert.p05@example.com` | Elena: nota 90, asistencia 60 %; ambos tipos bloqueados |
| `s3.cert.p06@example.com` | Fabio: una nota pendiente, asistencia 100 %; solo participación |
| `s3.cert.p07@example.com` | Gabriela: aprobación válida con diseño predeterminado |
| `s3.cert.p08@example.com` | Hugo: participación válida con plantilla moderna, sin notas |
| `s3.cert.p09@example.com` | Inés: certificado anulado, listo para reemitir |
| `s3.cert.p10@example.com` | Jorge: original anulado y reemplazo válido con plantilla clásica |
| `s3.cert.p11@example.com` | Karla: solo preinscrita, excluida de candidatos |
| `s3.cert.p12@example.com` | Luis: solo curso en desarrollo y galería vacía |

El curso principal (`DEMO-S3-CERT-01`) tiene cinco sesiones de dos horas y dos evaluaciones, ponderadas al 40 % y 60 %, sobre 100 puntos. Asistencia: cinco, cuatro y tres presencias equivalen a 100 %, 80 % y 60 %. No se inventan notas para participación.

Ana también está inscrita en `DEMO-S3-CERT-02` (sesiones futuras), `DEMO-S3-CERT-03` (sin sesiones) y `DEMO-S3-CERT-04` (duración ausente). Esos tres cursos bloquean ambos tipos de certificado. El curso en desarrollo solo tiene asistencias en las dos sesiones pasadas.

## Guion de presentación

1. Iniciar backend y frontend con la configuración habitual. Abrir `/iniciar-sesion` e ingresar como administrador.
2. Abrir `/certificados`, elegir `DEMO-S3-CERT-01` y aprobación. Mostrar habilitados, bloqueados y exclusión de Karla. Cambiar a participación para mostrar la habilitación de Diego y Fabio. Revisar también los otros tres cursos bloqueados.
3. En `/plantillas-certificados`, mostrar las plantillas de aprobación clásica y participación moderna. Editar una y mostrar que los certificados emitidos conservan el snapshot anterior; también se puede crear una plantilla desde la interfaz.
4. Emitir aprobación individual para Ana, sin plantilla para ver el diseño predeterminado. Emitir por lote para Bruno y Carla, eligiendo la plantilla de aprobación. Un participante ya certificado queda bloqueado para emisión duplicada. La interfaz puede impedir seleccionar candidatos no habilitados; no se alteran sus reglas para forzar fallos de lote.
5. Emitir participación para Diego y/o Fabio con plantilla moderna. No exigirles una aprobación académica que no tienen.
6. Entrar como Gabriela y abrir `/mis-certificados`: listado, detalle, descarga del PDF, enlace compartido y QR. Abrir el enlace de verificación en una ventana privada. El QR usa el origen configurado: desde `localhost` no es accesible en otro dispositivo.
7. Entrar como Hugo para mostrar un certificado de participación con plantilla. Entrar como Luis para mostrar la galería vacía.
8. Como administrador, anular un certificado válido con motivo. Comprobar estado anulado públicamente y bloqueo de descarga. Reemitir el de Inés con motivo y plantilla; el original permanece anulado y el nuevo código válido.
9. Mostrar el historial de Jorge: original, motivo de anulación, reemplazo y motivo de reemisión. Verificar ambos códigos. Un participante no puede consultar el certificado privado de otro; un instructor no puede administrar emisión.

## Manifiesto, repetición y recuperación

El archivo `backend/.local/certificates-module/manifest.json`, excluido por el `.gitignore` existente, conserva proyecto, fecha inicial, IDs de Auth y perfiles, cursos, inscripciones, plantillas, códigos, enlaces, estados iniciales y relación del reemplazo. No contiene contraseñas, claves API ni tokens. Un bloqueo `manifest.json.lock` evita ejecuciones simultáneas desde esta copia.

Repetir el comando con un manifiesto completo solo valida identidades y relaciones; **no modifica fechas, calificaciones, plantillas, estados ni certificados creados durante la demo**. No hay comando automático de reset o limpieza. El manifiesto debe conservarse junto con la copia que hizo la carga.

Si hay registros reservados sin manifiesto, referencias faltantes, otra carga en curso o un manifiesto parcial, el script se detiene. No adopta cuentas ajenas ni sobrescribe información. Una colisión puede requerir elegir otro entorno o una revisión manual, no borrar indiscriminadamente los datos encontrados.

Ante un fallo antes del commit, PostgreSQL revierte la transacción y el script intenta eliminar solo las cuentas Auth recién creadas por esa ejecución. El manifiesto `failed` registra los IDs cuya compensación falló. Si una solicitud Auth termina con timeout, revisar también el correo reservado de esa operación: el servidor podría haber creado la cuenta sin devolver su ID.

Si se pierde la conexión durante el commit, el script espera el bloqueo de la transacción y comprueba que no se hayan confirmado los perfiles antes de compensar Auth. Si no puede demostrarlo, conserva las cuentas y exige revisión manual.

Si el proceso se interrumpe o el disco falla, revisar el manifiesto, el archivo `.tmp` y los registros del proyecto antes de reintentar. Si PostgreSQL confirmó pero falló la escritura final del manifiesto, **no eliminar las cuentas ni repetir la carga**: recuperar las referencias existentes tras revisión. Retirar un bloqueo residual solo después de comprobar que el proceso terminó. Los scripts no aplican recuperaciones destructivas automáticamente.

## Verificación

Pruebas locales y tipos; no llaman a Supabase y no ejecutan `seed.ts` ni `verify.ts`:

```powershell
npx vitest run "prisma/Certificates Module"
npx tsc -p "prisma/Certificates Module/tsconfig.json"
```

Después de una futura carga y **antes de operar la demo**, con el backend iniciado:

```powershell
npx tsx "prisma/Certificates Module/verify.ts"
```

El verificador comprueba login, candidatos por tipo y exclusión de preinscritos, bloqueos de los otros cursos, historial, cinco certificados (tres válidos y dos anulados), verificación pública sin sesión, detalle por propietario, rechazo de acceso ajeno, PDF y galería vacía. No emite, anula ni reemite certificados. Abre sesiones temporales de Auth y solicita cerrarlas al terminar; no imprime tokens. Está pensado para el estado inicial: después de emitir o anular durante la demo, algunas comprobaciones dejarán de coincidir y eso no implica que el seed deba restaurarlas.

La inspección visual del PDF, el QR y los botones se completa con el guion anterior. La firma institucional queda fuera de esta demo.
