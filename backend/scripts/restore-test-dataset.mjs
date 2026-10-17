import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient, Prisma } from '@prisma/client';

const apply = process.argv.includes('--apply');
const local = new URL('../.local/', import.meta.url);
const backup = JSON.parse(await readFile(new URL('demo-cleanup-backup-1792168588869.json', local), 'utf8'));
const users = backup.rows.usuarios;
if (users.length !== 7 || users.some(user => !/@eva\.local$|^eva-instructor-test-.*@example\.com$/.test(user.correo))) throw new Error('Unexpected user backup.');
const subjects = ['PostgreSQL','JavaScript','Git y GitHub','Linux','Redes de computadoras','Python','Excel','Desarrollo web','Seguridad informática','Análisis de datos'];
const marker = 'DEMOSTRACION SIN VALIDEZ ACADEMICA';
const dataset = 'eva-restored-test-20261016';
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('connect_timeout','15'); url.searchParams.set('pool_timeout','30'); url.searchParams.set('connection_limit','1');
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) }
});
const publicUrl = new URL(process.env.PUBLIC_APP_URL ?? 'http://localhost:4200');
if (!['http:','https:'].includes(publicUrl.protocol)) throw new Error('Invalid public app URL.');
let accounts = [];
let credentials;
try {
  const current = await prisma.$queryRaw`SELECT id::text AS id,correo,auth_id::text AS auth_id FROM public.usuarios WHERE id IN (${Prisma.join(users.map(user => BigInt(user.id)))})`;
  for (const row of current) {
    const expected = users.find(user => String(user.id) === row.id);
    if (row.correo !== expected.correo) throw new Error('A restored ID belongs to a different account; refusing to overwrite.');
  }
  const [counts] = await prisma.$queryRaw`SELECT (SELECT count(*)::integer FROM public.usuarios) AS users,(SELECT count(*)::integer FROM public.cursos) AS courses,(SELECT count(*)::integer FROM public.inscripciones) AS enrollments,(SELECT count(*)::integer FROM public.certificados) AS certificates`;
  console.log(JSON.stringify({ current: counts, restoreProfiles: users.map(user => ({ id: user.id,email: user.correo,role: user.rol })), addTestCourses: 10, targetTestEnrollments: 10, targetTestCertificates: { aprobacion: 5, participacion: 5 } }));
  if (!apply) process.exitCode = 0;
  else {
    const credentialsUrl = new URL('restored-test-credentials.json', local);
    try { credentials = JSON.parse(await readFile(credentialsUrl,'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      credentials = { dataset, generatedAt: new Date().toISOString(), loginUrl: new URL('/iniciar-sesion', publicUrl).toString(), users: users.map(user => ({ email: user.correo, password: `Eva!${randomBytes(24).toString('base64url')}9a`, profileId: String(user.id), role: user.rol })) };
      await mkdir(local,{ recursive: true });
      await writeFile(credentialsUrl, JSON.stringify(credentials,null,2), { flag: 'wx',mode: 0o600 });
    }
    if (credentials.dataset !== dataset || credentials.users.length !== 7) throw new Error('Unexpected credentials manifest.');
    const authUsers = [];
    for (let page=1; ; page++) {
      const result = await db.auth.admin.listUsers({ page,perPage: 100 });
      if (result.error) throw new Error(`Auth listing failed: ${result.error.code}`);
      authUsers.push(...result.data.users);
      if (result.data.users.length < 100) break;
    }
    for (const user of users) {
      const credential = credentials.users.find(item => item.email === user.correo);
      if (!credential?.password) throw new Error('Missing locally generated credential.');
      let identity = authUsers.find(item => item.email?.toLowerCase() === user.correo.toLowerCase());
      if (identity && identity.user_metadata?.eva_test_dataset !== dataset) throw new Error('An unmarked Auth account already uses a restored email.');
      if (!identity) {
        const result = await db.auth.admin.createUser({ email: user.correo,password: credential.password,email_confirm: true,
          user_metadata: { full_name: user.nombre_completo || `Participante de prueba ${user.id}`,eva_test_dataset: dataset } });
        if (result.error || !result.data.user) throw new Error(`Test identity creation failed: ${result.error?.code ?? result.error?.status}`);
        identity = result.data.user;
      }
      accounts.push({ ...user,auth_id: identity.id,nombre_completo: user.nombre_completo || `Participante de prueba ${user.id}`,nombre: user.nombre_completo || `Participante de prueba ${user.id}` });
      credential.authId = identity.id;
      await writeFile(credentialsUrl, JSON.stringify(credentials,null,2), { mode: 0o600 });
    }
    const output = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(431231016)::text`;
      const [admin] = await tx.$queryRaw`SELECT id::integer AS id FROM public.usuarios WHERE correo='maykel.zalazar@gmail.com' AND rol::text='administrador' AND activo=true`;
      if (!admin) throw new Error('Real administrator is required.');
      const types = await tx.$queryRaw`SELECT id,nombre FROM public.tipos_participante ORDER BY id`;
      const studentType = types.find(item => item.nombre === 'Estudiante')?.id;
      if (!studentType) throw new Error('Missing reference participant type.');
      for (const user of accounts) {
        const row = { ...user,tipo_participante_id: user.rol === 'participante' ? user.tipo_participante_id ?? studentType : null };
        await tx.$executeRaw`INSERT INTO public.usuarios SELECT (jsonb_populate_record(NULL::public.usuarios,${JSON.stringify(row)}::jsonb)).*
          ON CONFLICT(auth_id) DO UPDATE SET id=EXCLUDED.id,nombre_completo=EXCLUDED.nombre_completo,nombre=EXCLUDED.nombre,
            correo=EXCLUDED.correo,rol=EXCLUDED.rol,activo=EXCLUDED.activo,tipo_participante_id=EXCLUDED.tipo_participante_id`;
      }
      const instructor = accounts.find(user => user.rol === 'instructor');
      if (!instructor) throw new Error('Missing restored instructor.');
      const participants = accounts.filter(user => user.rol === 'participante');
      const items = [];
      for (let index=0;index<subjects.length;index++) {
        const code = `EVA-PRUEBA-20261016-${String(index+1).padStart(2,'0')}`;
        const name = `[PRUEBA] ${subjects[index]} - ${marker}`;
        let [course] = await tx.$queryRaw`SELECT id::integer AS id,nombre FROM public.cursos WHERE codigo=${code}`;
        if (course && course.nombre !== name) throw new Error('A test course code is already used by different data.');
        if (!course) [course] = await tx.$queryRaw`INSERT INTO public.cursos(nombre,codigo,descripcion,contenido,horas,duracion_horas,instructor,instructor_id,cupo_maximo,capacidad,minimo_inscritos,
          horario,fecha_inicio,fecha_fin,fecha_inicio_preinscripcion,fecha_fin_preinscripcion,nota_minima,asistencia_minima,criterios_aprobacion,estado)
          VALUES(${name},${code},${marker},'Datos académicos sintéticos para probar inscripciones y certificados.',4,4,${instructor.nombre_completo},${instructor.id},20,20,1,
          'Jueves 14:00-18:00',DATE '2026-10-01',DATE '2026-10-08',DATE '2026-09-01',DATE '2026-09-25',70,80,'Nota mínima 70/100 y asistencia mínima 80%.','publicado') RETURNING id::integer AS id,nombre`;
        for (const type of types) await tx.$executeRaw`INSERT INTO public.precios_curso(curso_id,tipo_participante_id,precio_base) VALUES(${course.id},${type.id},0) ON CONFLICT(curso_id,tipo_participante_id) DO NOTHING`;
        const participant = participants[index % participants.length];
        const participantType = participant.tipo_participante_id ?? studentType;
        let [enrollment] = await tx.$queryRaw`SELECT id FROM public.inscripciones WHERE curso_id=${course.id} AND participante_id=${participant.id}`;
        if (!enrollment) [enrollment] = await tx.$queryRaw`INSERT INTO public.inscripciones(curso_id,participante_id,tipo_participante_id,estado,precio_base,monto_final,confirmada_en) VALUES(${course.id},${participant.id},${participantType},'inscrito',0,0,now()) RETURNING id`;
        let [session] = await tx.$queryRaw`SELECT id::integer AS id FROM public.sesiones WHERE curso_id=${course.id} AND numero_sesion=1`;
        if (!session) [session] = await tx.$queryRaw`INSERT INTO public.sesiones(curso_id,numero_sesion,titulo,descripcion,fecha,hora_inicio,hora_fin,duracion_minutos) VALUES(${course.id},1,'Sesión de prueba',${marker},DATE '2026-10-08',TIME '14:00',TIME '18:00',240) RETURNING id::integer AS id`;
        await tx.$executeRaw`INSERT INTO public.asistencias_participantes(sesion_id,inscripcion_id,estado,registrado_por,observacion) SELECT ${session.id},${enrollment.id},'presente',${admin.id},${marker} WHERE NOT EXISTS (SELECT 1 FROM public.asistencias_participantes WHERE sesion_id=${session.id} AND inscripcion_id=${enrollment.id})`;
        const type = index < 5 ? 'aprobacion' : 'participacion';
        if (type === 'aprobacion') {
          let [evaluation] = await tx.$queryRaw`SELECT id::integer AS id FROM public.evaluaciones WHERE curso_id=${course.id} AND nombre='Evaluación de prueba'`;
          if (!evaluation) [evaluation] = await tx.$queryRaw`INSERT INTO public.evaluaciones(curso_id,nombre,descripcion,ponderacion,fecha_evaluacion) VALUES(${course.id},'Evaluación de prueba',${marker},100,DATE '2026-10-08') RETURNING id::integer AS id`;
          await tx.$executeRaw`INSERT INTO public.calificaciones(evaluacion_id,inscripcion_id,nota,registrado_por,observacion) SELECT ${evaluation.id},${enrollment.id},${85+index},${admin.id},${marker} WHERE NOT EXISTS (SELECT 1 FROM public.calificaciones WHERE evaluacion_id=${evaluation.id} AND inscripcion_id=${enrollment.id})`;
        }
        let [certificate] = await tx.$queryRaw`SELECT c.id::text AS id,c.codigo_verificacion AS code,c.tipo::text AS type FROM public.certificados c JOIN public.resultados_curso r ON r.id=c.resultado_curso_id WHERE r.inscripcion_id=${enrollment.id}`;
        if (certificate && certificate.type !== type) throw new Error('Existing test certificate has a different type.');
        if (!certificate) {
          const verificationCode = randomBytes(4).toString('hex').toUpperCase();
          const link = new URL(`/verificar/${verificationCode}`,publicUrl).toString();
          const [result] = await tx.$queryRaw`SELECT public.emit_certificate_for_type(${BigInt(enrollment.id)},${verificationCode},${link},${BigInt(admin.id)},${type}) AS certificate`;
          certificate = { id: result.certificate.id,code: verificationCode,type };
        }
        items.push({ courseId: String(course.id),courseCode: code,subject: subjects[index],enrollmentId: String(enrollment.id),participantEmail: participant.correo,certificateId: certificate.id,certificateCode: certificate.code,type,verificationUrl: new URL(`/verificar/${certificate.code}`,publicUrl).toString() });
      }
      return { dataset,applied: true,completedAt: new Date().toISOString(),restoredProfiles: accounts.map(user => ({ id: String(user.id),email: user.correo,role: user.rol })),items };
    },{ timeout: 120000,maxWait: 30000 });
    await writeFile(new URL('restored-test-dataset.json',local),JSON.stringify(output,null,2));
    console.log(JSON.stringify({ applied: true,restoredProfiles: output.restoredProfiles.length,courses: output.items.length,enrollments: output.items.length,certificates: output.items.length,approval: output.items.filter(item => item.type==='aprobacion').length,participation: output.items.filter(item => item.type==='participacion').length,credentialsFile: '.local/restored-test-credentials.json',datasetFile: '.local/restored-test-dataset.json' }));
  }
} catch(error) {
  console.error('Test dataset failed; database transaction rolls back when applicable. Created Auth identities remain identifiable for retry. Code:',error.code ?? error.message);
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
