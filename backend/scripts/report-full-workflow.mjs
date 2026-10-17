import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
const local = new URL('../.local/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('full-workflow-dataset.json', local), 'utf8'));
const verification = JSON.parse(await readFile(new URL('full-workflow-verification.json', local), 'utf8'));
const bulk = JSON.parse(await readFile(new URL('full-workflow-bulk-verification.json', local), 'utf8'));
if (!bulk.passed) throw new Error('Complete bulk verification first.');
verification.requests += bulk.requests;
const exercise = JSON.parse(await readFile(new URL('full-workflow-exercise.json', local), 'utf8'));
if (!verification.passed || !exercise.completed) throw new Error('Complete API verification first.');
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('connect_timeout', '15');
url.searchParams.set('connection_limit', '1');
url.searchParams.set('pool_timeout', '30');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
try {
  const [totals] = await db.$queryRaw`SELECT
    (SELECT count(*)::integer FROM public.usuarios) AS usuarios,
    (SELECT count(*)::integer FROM public.usuarios WHERE rol::text='instructor') AS instructores,
    (SELECT count(*)::integer FROM public.cursos) AS cursos,
    (SELECT count(*)::integer FROM public.inscripciones) AS inscripciones,
    (SELECT count(*)::integer FROM public.inscripciones WHERE estado::text='preinscrito') AS preinscripciones,
    (SELECT count(*)::integer FROM public.inscripciones WHERE estado::text='inscrito') AS confirmadas,
    (SELECT count(*)::integer FROM public.inscripciones WHERE beca_activa=true) AS becas_activas,
    (SELECT count(*)::integer FROM public.pagos) AS pagos,
    (SELECT count(*)::integer FROM public.sesiones) AS sesiones,
    (SELECT count(*)::integer FROM public.asistencias_participantes) AS asistencias_participantes,
    (SELECT count(*)::integer FROM public.asistencias_instructores) AS asistencias_instructores,
    (SELECT count(*)::integer FROM public.evaluaciones) AS evaluaciones,
    (SELECT count(*)::integer FROM public.calificaciones) AS calificaciones,
    (SELECT count(*)::integer FROM public.certificados) AS certificados,
    (SELECT count(*)::integer FROM public.certificados WHERE estado::text='anulado') AS certificados_anulados`;
  const actions = {
    ABIERTA: '25 preinscritos: paginación, búsqueda, pago pendiente, parcial, completo y becas.',
    BORRADOR: 'Editar, publicar, despublicar y planificar sesiones.',
    LLENO: 'Intentar preinscripción: debe rechazar por falta de cupos.',
    CERRADA: 'Intentar preinscripción fuera del plazo: debe rechazar.',
    'EN-CURSO':
      'Marcar clases pendientes, corregir asistencia y consultar notas parciales. Hay sesiones futuras y una sesión bloqueada por asistencia del instructor.',
    APROBADOS: 'Emitir certificados individuales o por lote; todos cumplen nota y asistencia.',
    REPROBADOS:
      'Separar nota insuficiente de asistencia insuficiente. Los que asistieron pueden optar a participación.',
    'NOTAS-PENDIENTES': 'Completar calificaciones; aprobación bloqueada hasta entonces.',
    PARTICIPACION: 'Emitir por asistencia sin notas; ejemplos emitidos y pendientes para practicar.',
    CERTIFICADOS:
      'Dos vigentes, uno anulado y otros pendientes. Comprobar QR y bloqueo de descarga del anulado.',
    GRATUITO: 'Confirmar inscripción sin registrar pago.',
    'BECA-TOTAL': 'Confirmar inscripción con beca 100 %, sin pago.',
    'SIN-INSTRUCTOR': 'Asignar instructor al borrador antes de practicar planificación.',
    MINIMO: 'Comparar 3 inscritos frente al mínimo de 10.',
    'SIN-SESIONES': 'La falta de sesiones impide certificar, aunque existan notas.',
  };
  let md = `# Guía para probar el flujo de EVA\n\nBase poblada y verificada el ${manifest.anchorDate}. Los datos añadidos son sintéticos y los cursos/certificados llevan la marca de demostración. Se conservaron los usuarios reales, los tres cursos anteriores y los diez cursos de prueba de la carga previa.\n\n`;
  md +=
    '## Acceso\n\n- Aplicación: http://localhost:4200/iniciar-sesion\n- Administrador de prueba: `admin@eva.local`.\n- Instructoras/es de prueba: `carla.instructor@eva.local`, `diego.flujo@eva.local`, `valeria.flujo@eva.local`.\n- Participantes iniciales: `luis@eva.local`, `marta@eva.local`, `pedro@eva.local`.\n- Participantes adicionales: `alumno01.flujo@eva.local` a `alumno20.flujo@eva.local`.\n- Contraseñas de las siete cuentas restauradas: `backend/.local/restored-test-credentials.json`.\n- Contraseñas de las 22 cuentas adicionales: `backend/.local/full-workflow-credentials.json`.\n- El administrador real conserva su contraseña y perfil. Los archivos de contraseñas están excluidos de Git. No se utilizan contraseñas SMTP para entrar a EVA.\n\n';
  md +=
    '## Inventario\n\n| Registro | Cantidad |\n|---|---:|\n' +
    Object.entries(totals)
      .map(([name, count]) => `| ${name} | ${count} |`)
      .join('\n') +
    '\n\n';
  md +=
    '## Escenarios para recorrer\n\nEntra a Cursos o Inscripciones y busca por el código. Los pendientes se dejaron disponibles para practicar; el recorrido integral utilizó un curso adicional y la prueba por lote emitió dos aprobaciones y dos participaciones; quedan más candidatos para practicar.\n\n| Código | Curso ID | Qué probar |\n|---|---:|---|\n';
  for (const item of manifest.scenarios) md += `| ${item.code} | ${item.id} | ${actions[item.key]} |\n`;
  md +=
    '\n## Recorrido recomendado\n\n1. Como administrador, revisa Usuarios e Instructores; entra al curso `EVA-ABIERTA`, alterna estados y páginas y abre el detalle de una inscripción.\n2. Prueba asignar/desactivar una beca, registrar un pago parcial y completar el importe. La confirmación debe bloquearse mientras falte el pago requerido.\n3. En `EVA-GRATUITO` y `EVA-BECA-TOTAL`, confirma sin pago. Contrasta con los cursos llenos y cerrados.\n4. Como instructor asignado, entra a `EVA-EN-CURSO`: registra asistencia pendiente y comprueba que las clases futuras no admiten asistencia de alumnos.\n5. Como administrador, registra asistencia del instructor y verifica que esa sesión queda bloqueada para editar o eliminar.\n6. Como participante, revisa Mi progreso: notas parciales, pendientes, aprobados y reprobados.\n7. Como administrador, entra a Certificados y utiliza `EVA-APROBADOS` para emitir; cambia a Participación para comprobar los casos de asistencia sin nota.\n8. Como participante propietario, descarga y comparte el PDF. Como visitante, abre el enlace o QR sin iniciar sesión. Contrasta el certificado vigente con el anulado.\n\n';
  const revoked = manifest.scenarios.flatMap((item) => item.certificates).find((item) => item.revoked);
  if (revoked) md += `Certificado anulado de ejemplo: ${revoked.verificationUrl}\n\n`;
  md += `## Validación ejecutada\n\nSe comprobaron ${verification.requests} respuestas HTTP esperadas y los 15 escenarios. El recorrido adicional creó un curso por API y pasó por publicación, preinscripción, beca, pago parcial y completo, confirmación, sesiones, notas ponderadas, asistencia del alumno y del instructor, bloqueo de sesión, emisión, propiedad, verificación pública y descarga de PDF. Su curso es el ID ${exercise.courseId}, inscripción ${exercise.enrollmentId}, certificado ${exercise.certificateCode}. El PDF está en docs/output/recorrido-integral-certificado.pdf.\n\nLas evaluaciones y la carga de notas tienen API, pero todavía no tienen una pantalla de edición en este frontend; Mi progreso permite consultarlas. La validación fue por API y PostgreSQL; no sustituye una revisión visual completa del navegador. La firma institucional requiere un PKCS#12 real y no se activó una firma de prueba.\n\n`;
  md +=
    'Las fechas están ancladas al día de carga. Los escenarios con preinscripción abierta cierran siete días después de ese día; si se usan más adelante, deben ajustarse sus fechas. Los scripts no se ejecutan al iniciar el proyecto y rechazan sobrescribir escenarios ya poblados. No ejecutes scripts antiguos de limpieza sobre esta carga.\n';
  await writeFile(new URL('../../PRUEBAS_FLUJO.md', import.meta.url), md);
  await writeFile(
    new URL('full-workflow-totals.json', local),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), totals, apiRequests: verification.requests },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ totals, apiRequests: verification.requests, guide: 'PRUEBAS_FLUJO.md' }));
} finally {
  await db.$disconnect();
}
