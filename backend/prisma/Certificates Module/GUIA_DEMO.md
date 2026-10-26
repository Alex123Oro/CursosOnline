# Demo de certificados — Sprint 3

## Preparación

Desde `backend`, con Docker activo:

```powershell
npm run local:up
npm run local:use
npm run dev
```

Desde `frontend`, en otra terminal:

```powershell
npm start
```

Si los servidores ya están activos con la configuración local, no volver a iniciarlos.

Abrir [la aplicación](http://localhost:4200/iniciar-sesion).

- **Administrador:** `s3.cert.admin@example.com`.
- **Contraseña de todas las cuentas:** `CERTIFICATES_DEMO_PASSWORD` en `backend/.local/certificates-docker/local.env`.

## Guion de 10 minutos

| Paso | Qué hacer | Qué demostrar |
|---|---|---|
| 1. Requisitos | Como administrador, abrir **Certificados**, curso `DEMO-S3-CERT-01`, aprobación y plantilla **DEMO S3 · aprobacion**. | Ana, Bruno y Carla pueden recibir aprobación. Diego no cumple nota; Elena no cumple asistencia; Fabio tiene una nota pendiente. |
| 2. Emisión individual | Buscar a **Ana**, pulsar **Emitir certificado** y confirmar. | Se genera un código y se bloquea una emisión duplicada. |
| 3. Emisión por lote | Borrar la búsqueda y pulsar **Emitir elegibles (2)**. Confirmar para **Bruno y Carla**. | Se emiten varios certificados respetando requisitos. |
| 4. Participación | Cambiar a participación, seleccionar **DEMO S3 · participacion** y emitir individualmente a **Diego**. | Puede recibir participación por su asistencia, aunque no aprobó la nota. |
| 5. PDF y compartir | En una ventana privada, entrar como `s3.cert.p07@example.com` (**Gabriela**). Abrir **Mis certificados**, descargar PDF y copiar el enlace desde **Compartir**. | Documento, código, QR y acceso del participante. |
| 6. Verificación pública | Sin sesión, abrir los enlaces de la tabla siguiente. | Diferencia entre certificado válido y anulado. |
| 7. Anulación | Como administrador, buscar a **Gabriela**, pulsar **Anular con motivo**, escribir un motivo y confirmar. Recargar su enlace público. | El código pasa a anulado y se bloquea la descarga. |
| 8. Reemisión | Buscar a **Inés**, seleccionar aprobación y plantilla, pulsar **Reemitir certificado**, escribir un motivo y confirmar. Abrir su historial. | Nuevo código válido; original anulado conservado. |
| 9. Plantillas | Abrir **Plantillas de certificados** y mostrar los diseños clásico y moderno. | Configuración del documento y versiones de plantilla. |

**Importante:** la interfaz requiere una plantilla para emitir. El lote incluye todos los elegibles del curso, aunque estén en otra página o haya una búsqueda activa. Emitir primero a Ana deja exactamente a Bruno y Carla para el lote.

## Enlaces listos para mostrar

| Certificado | Estado inicial | Enlace |
|---|---|---|
| Gabriela | Válido; anulado después del paso 7 | [59B221E0](http://localhost:4200/verificar/59B221E0) |
| Inés, original | Anulado | [3DB727D4](http://localhost:4200/verificar/3DB727D4) |
| Jorge, original | Anulado | [A6AB772C](http://localhost:4200/verificar/A6AB772C) |
| Jorge, reemplazo | Válido | [26B1889E](http://localhost:4200/verificar/26B1889E) |

**Respaldo:** Jorge ya tiene un historial de anulación y reemisión preparado. Para mostrar una galería vacía, ingresar como `s3.cert.p12@example.com` (**Luis**).

## Cierre

> “El módulo comprueba requisitos, permite emitir individualmente o por lote y ofrece descarga y verificación pública. La anulación y la reemisión conservan el historial.”

- Los datos son ficticios y están en Docker local. El PDF no tiene firma criptográfica institucional.
- El QR apunta a `localhost`: mostrar su enlace desde esta computadora.
- Ensayar modifica la demo. Reiniciar Docker o repetir el seed **no restaura los casos iniciales**.
