import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
const local=new URL('../.local/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('ten-course-catalog.json',local),'utf8'));
const verification=JSON.parse(await readFile(new URL('ten-course-verification.json',local),'utf8'));
if(!verification.passed)throw new Error('Verify the new catalog first.');
const db=new PrismaClient();
try{
  const [totals]=await db.$queryRaw`SELECT (SELECT count(*)::integer FROM public.cursos) AS courses,(SELECT count(*)::integer FROM public.usuarios) AS users,
    (SELECT count(*)::integer FROM public.inscripciones WHERE estado::text='inscrito') AS confirmed,
    (SELECT count(*)::integer FROM public.inscripciones WHERE estado::text='preinscrito') AS pending,
    (SELECT count(*)::integer FROM public.pagos) AS payments,(SELECT count(*)::integer FROM public.inscripciones WHERE beca_activa) AS scholarships,
    (SELECT count(*)::integer FROM public.sesiones) AS sessions,(SELECT count(*)::integer FROM public.asistencias_participantes) AS studentAttendance,
    (SELECT count(*)::integer FROM public.asistencias_instructores) AS teacherAttendance,(SELECT count(*)::integer FROM public.evaluaciones) AS evaluations,
    (SELECT count(*)::integer FROM public.calificaciones) AS grades,(SELECT count(*)::integer FROM public.certificados) AS certificates,
    (SELECT count(*)::integer FROM public.certificados WHERE estado::text='anulado') AS revoked`;
  await writeFile(new URL('ten-course-totals.json',local),JSON.stringify(totals,null,2));
  const labels={upcoming:'Próximo inicio',ongoing:'En curso',finished:'Finalizado'};
  let text='# Guía del catálogo de 10 cursos\n\nActualizado el 16 de octubre de 2026. Esta carga reemplaza todos los cursos anteriores y sus registros relacionados. Los 51 usuarios y sus accesos se conservaron. Cada curso tiene portada, programa, instructor, precios por categoría, calendario y 20 inscritos confirmados.\n\n';
  text+='## Acceso\n\n- Catálogo: http://127.0.0.1:4200/catalogo\n- Administración: http://127.0.0.1:4200/cursos\n- Administrador: `admin@eva.local` o la cuenta real ya configurada.\n- Instructores: `carla.instructor@eva.local`, `diego.flujo@eva.local` y `valeria.flujo@eva.local`.\n- Participante recomendado: `alumno05.flujo@eva.local`; tiene los 10 cursos y certificados de aprobación, participación y un certificado anulado.\n- Contraseñas: archivos locales excluidos de Git `backend/.local/restored-test-credentials.json`, `backend/.local/full-workflow-credentials.json` y `backend/.local/roster-participant-credentials.json`. No se cambiaron contraseñas.\n\n';
  text+='## Cursos\n\n| Curso | ID | Estado | Clases | Inscritos |\n|---|---:|---|---:|---:|\n';
  for(const c of manifest.courses)text+=`| ${c.name} | ${c.id} | ${labels[c.phase]} | ${c.sessions} | 20 |\n`;
  text+='\n## Qué probar\n\n- **Administrador:** editar portada mediante archivo, enlace o galería, revisar la vista previa y guardar. Las imágenes subidas se guardan en Supabase Storage; PNG, JPEG o WebP de hasta 5 MB. Las 10 portadas incluidas están en `frontend/public/images/course-covers/`.\n- **Preinscripciones y pagos:** JavaScript, Python y Diseño web tienen cuatro preinscritos adicionales por curso: sin pago, pago parcial, pago completo y beca total. Prueba bloquear la confirmación sin saldo, completar un pago y confirmar.\n- **Instructor asignado:** PostgreSQL, Excel y Linux tienen clases pasadas y futuras, una clase pasada con asistencia pendiente y notas parciales. Registra asistencias y consulta el calendario. Una sesión con asistencia de instructor registrada queda bloqueada para editar o eliminar.\n- **Asistencia de instructores:** el administrador puede revisar los tres historiales y registrar las clases pendientes.\n- **Evaluaciones y notas:** cada curso tiene dos evaluaciones ponderadas (40% y 60%), excepto Git, que permite participación sin notas. La edición de calificaciones está disponible por API; la interfaz de Mi progreso muestra sus resultados.\n- **Certificados:** Git tiene participación por asistencia; Redes tiene aprobados pendientes y certificados emitidos; Seguridad combina nota insuficiente, asistencia insuficiente y un certificado anulado; Análisis de datos combina aprobados y cinco alumnos con nota final pendiente.\n- **Participante:** revisar Mi progreso, abrir Mis certificados, descargar PDF y comprobar el QR o enlace público. El certificado anulado no permite descarga.\n- **Visitante:** buscar y filtrar los cursos, ver su portada y detalle, precios y convocatoria; verificar certificados sin iniciar sesión.\n\n';
  text+='## Resumen de datos\n\n'+Object.entries(totals).map(([key,value])=>`- ${key}: ${value}`).join('\n')+'\n\n';
  text+='## Respaldo y validación\n\nRespaldo previo al reemplazo: `backend/.local/'+manifest.backup+'`. Incluye los 29 cursos anteriores y sus inscripciones, pagos, becas, sesiones, asistencias, evaluaciones, notas, resultados y certificados. No volver a ejecutar el reemplazo: el script impide repetirlo una vez aplicado.\n\nVerificación real: `backend/.local/ten-course-verification.json`; subida a Supabase, persistencia y restauración de portada, recuentos, roles, progreso, asistencias y certificados. Las pruebas de datos conservan su procedencia de demostración en metadatos y PDF.\n';
  const guide=new URL('../../PRUEBAS_FLUJO.md',import.meta.url);
  try{await writeFile(new URL('guide-before-course-replacement.md',local),await readFile(guide),{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
  await writeFile(guide,text);
  console.log(JSON.stringify(totals));
}finally{await db.$disconnect();}
