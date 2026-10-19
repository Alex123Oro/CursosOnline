import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const local = new URL('../.local/', import.meta.url);
const dataset = 'eva-complete-flow-20261016';
const marker = 'DEMOSTRACION SIN VALIDEZ ACADEMICA';
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/La_Paz' }).format(new Date());
const day = (offset) =>
  new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const date = (offset) => new Date(`${day(offset)}T00:00:00Z`);
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('connect_timeout', '15');
url.searchParams.set('pool_timeout', '30');
url.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) },
});
const scenarios = [
  { key: 'ABIERTA', name: 'Preinscripción abierta y pagos', count: 25 },
  { key: 'BORRADOR', name: 'Borrador para publicar', count: 0, draft: true },
  { key: 'LLENO', name: 'Curso sin cupos', count: 2, capacity: 2 },
  { key: 'CERRADA', name: 'Preinscripción cerrada', count: 0, closed: true },
  { key: 'EN-CURSO', name: 'Asistencia y evaluaciones en curso', count: 10, ongoing: true },
  { key: 'APROBADOS', name: 'Aprobados pendientes de emisión', count: 8, finished: true },
  { key: 'REPROBADOS', name: 'Nota o asistencia insuficiente', count: 6, finished: true },
  { key: 'NOTAS-PENDIENTES', name: 'Calificaciones pendientes', count: 6, finished: true },
  {
    key: 'PARTICIPACION',
    name: 'Participación sin evaluaciones',
    count: 6,
    finished: true,
    noEvaluations: true,
  },
  { key: 'CERTIFICADOS', name: 'Certificados válidos y anulado', count: 5, finished: true },
  { key: 'GRATUITO', name: 'Inscripción gratuita', count: 3, free: true },
  { key: 'BECA-TOTAL', name: 'Beca total sin pago', count: 3, totalScholarship: true },
  {
    key: 'SIN-INSTRUCTOR',
    name: 'Asignación de instructor pendiente',
    count: 0,
    draft: true,
    unassigned: true,
  },
  { key: 'MINIMO', name: 'Mínimo de inscritos no alcanzado', count: 3, minimum: 10 },
  {
    key: 'SIN-SESIONES',
    name: 'Finalizado sin sesiones registradas',
    count: 4,
    finished: true,
    noSessions: true,
  },
];
const people = [
  'Lucía Fernández',
  'Mateo Rojas',
  'Valentina Flores',
  'Santiago Mamani',
  'Camila Quispe',
  'Sebastián Vargas',
  'Isabella López',
  'Nicolás Condori',
  'Mariana Arce',
  'Gabriel Mendoza',
  'Daniela Ortiz',
  'Diego Suárez',
  'Sofía Torres',
  'Andrés Molina',
  'Paula Gutiérrez',
  'Joaquín Salazar',
  'Renata Castro',
  'Emiliano Pérez',
  'Gabriela Silva',
  'Martín Romero',
];
const definitions = people.map((name, index) => ({
  email: `alumno${String(index + 1).padStart(2, '0')}.flujo@eva.local`,
  name: `[PRUEBA] ${name}`,
  role: 'PARTICIPANT',
  typeIndex: index % 4,
}));
definitions.push(
  {
    email: 'diego.flujo@eva.local',
    name: '[PRUEBA] Diego Quispe',
    role: 'INSTRUCTOR',
    degree: 'TECHNICIAN',
    sis: '900000001',
  },
  {
    email: 'valeria.flujo@eva.local',
    name: '[PRUEBA] Valeria Ríos',
    role: 'INSTRUCTOR',
    degree: 'ENGINEER',
    sis: '900000002',
  },
);
try {
  console.log(
    JSON.stringify({
      dataset,
      anchorDate: today,
      newParticipants: 20,
      newInstructors: 2,
      scenarios: scenarios.map((s) => ({ code: `EVA-FLUJO-${s.key}`, name: s.name, enrollments: s.count })),
    }),
  );
  if (apply) {
    const outputUrl = new URL('full-workflow-dataset.json', local);
    let prior;
    try {
      prior = JSON.parse(await readFile(outputUrl, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (prior?.applied)
      throw new Error('Dataset already populated; use its manifest, do not overwrite exercises.');
    const credentialsUrl = new URL('full-workflow-credentials.json', local);
    let credentials;
    try {
      credentials = JSON.parse(await readFile(credentialsUrl, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      credentials = {
        dataset,
        generatedAt: new Date().toISOString(),
        users: definitions.map((item) => ({
          ...item,
          password: `Eva!${randomBytes(24).toString('base64url')}a9`,
        })),
      };
      await writeFile(credentialsUrl, JSON.stringify(credentials, null, 2), { flag: 'wx', mode: 0o600 });
    }
    if (credentials.dataset !== dataset || credentials.users.length !== 22)
      throw new Error('Unexpected credentials manifest.');
    const authUsers = [];
    for (let page = 1; ; page++) {
      const result = await supabase.auth.admin.listUsers({ page, perPage: 100 });
      if (result.error) throw new Error(`Auth listing failed: ${result.error.code}`);
      authUsers.push(...result.data.users);
      if (result.data.users.length < 100) break;
    }
    const types = await db.participantType.findMany({ orderBy: { id: 'asc' } });
    if (types.length < 4) throw new Error('Missing participant categories.');
    for (const item of credentials.users) {
      let identity = authUsers.find((user) => user.email === item.email);
      if (identity && identity.user_metadata?.eva_test_dataset !== dataset)
        throw new Error('A planned test email belongs to an unmarked identity.');
      if (!identity) {
        const result = await supabase.auth.admin.createUser({
          email: item.email,
          password: item.password,
          email_confirm: true,
          user_metadata: { full_name: item.name, eva_test_dataset: dataset },
        });
        if (result.error || !result.data.user)
          throw new Error(`Auth creation failed: ${result.error?.code ?? result.error?.status}`);
        identity = result.data.user;
      }
      const profile = await db.user.upsert({
        where: { authId: identity.id },
        create: {
          authId: identity.id,
          email: item.email,
          name: item.name,
          role: item.role,
          participantTypeId: item.role === 'PARTICIPANT' ? types[item.typeIndex % types.length].id : null,
          degree: item.degree ?? null,
          sis: item.sis ?? null,
          phone: item.role === 'INSTRUCTOR' ? '+59170000000' : null,
        },
        update: {
          name: item.name,
          role: item.role,
          participantTypeId: item.role === 'PARTICIPANT' ? types[item.typeIndex % types.length].id : null,
          degree: item.degree ?? null,
          sis: item.sis ?? null,
        },
      });
      item.profileId = String(profile.id);
      item.authId = identity.id;
      await writeFile(credentialsUrl, JSON.stringify(credentials, null, 2), { mode: 0o600 });
    }
    const result = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(431231017)::text`;
        const actor = await tx.user.findUnique({ where: { email: 'maykel.zalazar@gmail.com' } });
        if (actor?.role !== 'ADMIN') throw new Error('Real administrator is required.');
        const restored = await tx.user.findMany({
          where: { id: { in: [5, 6, 7, 23, 24] } },
          orderBy: { id: 'asc' },
        });
        const added = await tx.user.findMany({
          where: {
            email: {
              in: credentials.users.filter((item) => item.role === 'PARTICIPANT').map((item) => item.email),
            },
          },
          orderBy: { id: 'asc' },
        });
        const participants = [...restored, ...added];
        if (participants.length !== 25) throw new Error('Expected 25 test participants.');
        const instructors = await tx.user.findMany({
          where: {
            email: { in: ['carla.instructor@eva.local', 'diego.flujo@eva.local', 'valeria.flujo@eva.local'] },
          },
          orderBy: { id: 'asc' },
        });
        if (instructors.length !== 3) throw new Error('Expected three test instructors.');
        const items = [];
        for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex++) {
          const scenario = scenarios[scenarioIndex];
          const instructor = instructors[scenarioIndex % instructors.length];
          const code = `EVA-FLUJO-${scenario.key}`;
          if (await tx.course.findUnique({ where: { code } }))
            throw new Error('A scenario course already exists; refusing to overwrite.');
          const sessionDays = scenario.noSessions
            ? []
            : scenario.finished
              ? [-15, -12, -9, -6, -3]
              : scenario.ongoing
                ? [-6, -4, -2, 0, 2, 4]
                : [10, 12, 14];
          const course = await tx.course.create({
            data: {
              code,
              name: `${scenario.name} - ${marker}`,
              content: `Escenario sintético: ${scenario.name}. Para practicar el flujo de EVA.`,
              durationHours: Math.max(2, sessionDays.length * 2),
              instructor: scenario.unassigned ? 'Pendiente de asignación' : instructor.name,
              instructorId: scenario.unassigned ? null : instructor.id,
              schedule: '18:00-20:00',
              approvalCriteria: 'Nota mínima de 70/100 y asistencia mínima del 80%.',
              status: scenario.draft ? 'DRAFT' : 'PUBLISHED',
              capacity: scenario.capacity ?? 30,
              minimumEnrollment: scenario.minimum ?? 1,
              startDate: date(scenario.finished ? -20 : scenario.ongoing ? -7 : 10),
              endDate: date(scenario.finished ? -1 : scenario.ongoing ? 14 : 20),
              preinscriptionStart: date(scenario.finished ? -40 : -7),
              preinscriptionEnd: date(scenario.finished ? -21 : scenario.closed ? -1 : 7),
              minimumPassingScore: 70,
              minimumAttendancePercent: 80,
            },
          });
          const prices = new Map();
          for (let i = 0; i < types.length; i++) {
            const amount = scenario.free ? 0 : [400, 500, 450, 600][i % 4];
            prices.set(types[i].id, amount);
            await tx.coursePrice.create({
              data: { courseId: course.id, participantTypeId: types[i].id, basePrice: amount },
            });
          }
          const sessions = [];
          for (let i = 0; i < sessionDays.length; i++)
            sessions.push(
              await tx.courseSession.create({
                data: {
                  courseId: course.id,
                  sessionNumber: i + 1,
                  date: date(sessionDays[i]),
                  startTime: '18:00',
                  durationMinutes: 120,
                },
              }),
            );
          const evaluations = [];
          if ((scenario.finished || scenario.ongoing) && !scenario.noEvaluations) {
            evaluations.push(
              await tx.courseEvaluation.create({
                data: { courseId: course.id, title: 'Práctica guiada', maxScore: 20, weight: 40 },
              }),
            );
            evaluations.push(
              await tx.courseEvaluation.create({
                data: { courseId: course.id, title: 'Proyecto final', maxScore: 100, weight: 60 },
              }),
            );
          }
          const enrollments = [];
          const certificates = [];
          for (let i = 0; i < scenario.count; i++) {
            const participant = participants[i];
            const confirmed = Boolean(scenario.finished || scenario.ongoing || scenario.key === 'MINIMO');
            const basePrice = prices.get(participant.participantTypeId);
            if (basePrice === undefined) throw new Error('Missing price for participant.');
            let scholarshipPercent = scenario.totalScholarship
              ? 100
              : scenario.key === 'ABIERTA'
                ? i === 3
                  ? 50
                  : i === 4
                    ? 100
                    : i === 6
                      ? 25
                      : i === 5
                        ? 30
                        : 0
                : confirmed && i === 1
                  ? 50
                  : 0;
            const scholarshipActive = scholarshipPercent > 0 && !(scenario.key === 'ABIERTA' && i === 5);
            const benefit = scholarshipActive ? Math.round(basePrice * scholarshipPercent) / 100 : 0;
            const finalAmount = basePrice - benefit;
            const enrollment = await tx.enrollment.create({
              data: {
                courseId: course.id,
                participantId: participant.id,
                participantTypeId: participant.participantTypeId,
                status: confirmed ? 'INSCRITO' : 'PREINSCRITO',
                basePrice,
                scholarshipPercent,
                scholarshipActive,
                scholarshipReason: scholarshipPercent ? 'Beca sintética para probar el sistema' : null,
                benefitAmount: benefit,
                finalAmount,
                confirmedAt: confirmed ? date(scenario.finished ? -22 : -8) : null,
              },
            });
            let paid = confirmed
              ? finalAmount
              : scenario.key === 'ABIERTA'
                ? i === 1
                  ? Math.round(finalAmount / 3)
                  : i === 2 || i === 6
                    ? finalAmount
                    : null
                : null;
            if (paid !== null && paid > 0)
              await tx.payment.create({ data: { enrollmentId: enrollment.id, amount: paid } });
            for (let s = 0; s < sessions.length; s++) {
              if (sessionDays[s] > 0) continue;
              if (scenario.ongoing && (s === 3 || (i % 4 === 0 && s === 2))) continue;
              let present = true;
              if (scenario.key === 'REPROBADOS' && i >= 3) present = s < 2;
              else if (scenario.key === 'APROBADOS' || scenario.key === 'PARTICIPACION')
                present = i % 2 === 0 || s !== 4;
              else if (scenario.ongoing) present = (i + s) % 5 !== 0;
              await tx.attendance.create({
                data: {
                  courseId: course.id,
                  sessionId: sessions[s].id,
                  enrollmentId: enrollment.id,
                  status: present ? 'PRESENT' : 'ABSENT',
                  recordedById: instructor.id,
                },
              });
            }
            for (let e = 0; e < evaluations.length; e++) {
              if ((scenario.ongoing || scenario.key === 'NOTAS-PENDIENTES') && (e === 1 || i % 3 === 0))
                continue;
              let score = e === 0 ? 17 : 88;
              if (scenario.key === 'REPROBADOS' && i < 3) score = e === 0 ? 8 : 45;
              await tx.evaluationGrade.create({
                data: {
                  evaluationId: evaluations[e].id,
                  enrollmentId: enrollment.id,
                  score,
                  comment: marker,
                  recordedById: instructor.id,
                },
              });
            }
            enrollments.push({
              id: String(enrollment.id),
              participantId: String(participant.id),
              participantEmail: participant.email,
              status: enrollment.status,
              basePrice,
              scholarshipPercent,
              scholarshipActive,
              finalAmount,
              payment: paid,
            });
            const certificateType =
              scenario.key === 'PARTICIPACION' && i < 2
                ? 'participacion'
                : scenario.key === 'CERTIFICADOS' && i < 3
                  ? 'aprobacion'
                  : null;
            if (certificateType) {
              const verificationCode = randomBytes(4).toString('hex').toUpperCase();
              const publicUrl = new URL(
                `/verificar/${verificationCode}`,
                process.env.PUBLIC_APP_URL,
              ).toString();
              const [issued] =
                await tx.$queryRaw`SELECT public.emit_certificate_for_type(${BigInt(enrollment.id)},${verificationCode},${publicUrl},${BigInt(actor.id)},${certificateType}) AS certificate`;
              const revoked = scenario.key === 'CERTIFICADOS' && i === 2;
              if (revoked) {
                await tx.$executeRaw`UPDATE public.certificados SET estado='anulado' WHERE id=${BigInt(issued.certificate.id)}`;
                await tx.$executeRaw`INSERT INTO public.anulaciones_certificados(certificado_id,anulado_por,motivo) VALUES(${BigInt(issued.certificate.id)},${actor.id},'PRUEBA: anulación para validar estado público y bloqueo de descarga')`;
              }
              certificates.push({
                id: String(issued.certificate.id),
                enrollmentId: String(enrollment.id),
                type: certificateType,
                code: verificationCode,
                revoked,
                verificationUrl: publicUrl,
              });
            }
          }
          for (let s = 0; s < sessions.length; s++)
            if (sessionDays[s] <= 0 && !(scenario.ongoing && s >= 2))
              await tx.instructorAttendance.create({
                data: {
                  courseId: course.id,
                  sessionId: sessions[s].id,
                  instructorId: instructor.id,
                  status: scenario.ongoing && s === 1 ? 'ABSENT' : 'PRESENT',
                  recordedById: actor.id,
                },
              });
          items.push({
            key: scenario.key,
            id: String(course.id),
            code,
            name: scenario.name,
            status: course.status,
            instructorId: course.instructorId ? String(course.instructorId) : null,
            sessions: sessions.map((session) => ({
              id: String(session.id),
              number: session.sessionNumber,
              date: session.date.toISOString().slice(0, 10),
            })),
            evaluationIds: evaluations.map((item) => String(item.id)),
            enrollments,
            certificates,
          });
        }
        return {
          dataset,
          applied: true,
          anchorDate: today,
          completedAt: new Date().toISOString(),
          newProfiles: credentials.users.map((item) => ({
            email: item.email,
            id: item.profileId,
            role: item.role,
          })),
          scenarios: items,
        };
      },
      { timeout: 240000, maxWait: 30000 },
    );
    await writeFile(outputUrl, JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify({
        applied: true,
        newProfiles: 22,
        scenarios: result.scenarios.length,
        enrollments: result.scenarios.reduce((n, s) => n + s.enrollments.length, 0),
        sessions: result.scenarios.reduce((n, s) => n + s.sessions.length, 0),
        certificates: result.scenarios.reduce((n, s) => n + s.certificates.length, 0),
        manifest: '.local/full-workflow-dataset.json',
        credentials: '.local/full-workflow-credentials.json',
      }),
    );
  }
} catch (error) {
  console.error('Workflow population stopped:', error.code ?? error.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
