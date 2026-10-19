import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const apply = process.argv.includes('--apply');
const sql = await readFile(
  new URL('../prisma/migrations/20261016030000_live_workflow_compatibility/migration.sql', import.meta.url),
  'utf8',
);
const statements = [];
let offset = 0;
for (const token of sql.matchAll(/(\$\w*\$)[\s\S]*?\1|'(?:''|[^'])*'|--[^\n]*|;/g)) {
  if (token[0] !== ';') continue;
  const statement = sql
    .slice(offset, token.index)
    .replace(/--[^\n]*/g, '')
    .trim();
  offset = token.index + 1;
  if (statement && !/^(BEGIN|COMMIT)$/i.test(statement)) statements.push(statement);
}
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('connect_timeout', '15');
url.searchParams.set('pool_timeout', '30');
url.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const rollback = new Error('VALIDATED_ROLLBACK');
let validation;
try {
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
      const [existing] =
        await tx.$queryRaw`SELECT to_regprocedure('public.sync_session_api_time()')::text AS existing`;
      if (existing.existing) throw new Error('Migration already applied; do not reapply.');
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
      const users = await tx.user.findMany({
        select: { id: true, name: true, sis: true, degree: true, phone: true },
      });
      const courses = await tx.course.findMany({
        include: {
          sessions: { include: { attendance: true, instructorAttendance: true } },
          evaluations: { include: { grades: true } },
        },
      });
      const actor = await tx.user.findUnique({ where: { email: 'maykel.zalazar@gmail.com' } });
      const instructor = await tx.user.findUnique({ where: { email: 'carla.instructor@eva.local' } });
      const participant = await tx.user.findUnique({ where: { email: 'luis@eva.local' } });
      if (!actor || !instructor || !participant?.participantTypeId)
        throw new Error('Missing test identities.');
      await tx.$executeRawUnsafe('SAVEPOINT compatibility_fixture');
      const course = await tx.course.create({
        data: {
          name: '[PRUEBA TEMPORAL] Compatibilidad',
          code: `COMPAT-${Date.now()}`,
          content: 'Validación transaccional de compatibilidad',
          durationHours: 1,
          instructor: instructor.name,
          instructorId: instructor.id,
          schedule: '18:00-19:00',
          approvalCriteria: 'Nota 70 y asistencia 80',
          capacity: 5,
        },
      });
      const session = await tx.courseSession.create({
        data: {
          courseId: course.id,
          sessionNumber: 1,
          date: new Date('2026-10-01'),
          startTime: '18:00',
          durationMinutes: 60,
        },
      });
      const [native] =
        await tx.$queryRaw`SELECT hora_inicio::text AS start,hora_fin::text AS finish FROM public.sesiones WHERE id=${session.id}`;
      if (native.start !== '18:00:00' || native.finish !== '19:00:00')
        throw new Error('Native/API session time synchronization failed.');
      const enrollment = await tx.enrollment.create({
        data: {
          courseId: course.id,
          participantId: participant.id,
          participantTypeId: participant.participantTypeId,
          status: 'INSCRITO',
          basePrice: 100,
          finalAmount: 100,
        },
      });
      await tx.attendance.create({
        data: {
          courseId: course.id,
          sessionId: session.id,
          enrollmentId: enrollment.id,
          status: 'PRESENT',
          recordedById: actor.id,
        },
      });
      await tx.instructorAttendance.create({
        data: {
          courseId: course.id,
          sessionId: session.id,
          instructorId: instructor.id,
          status: 'PRESENT',
          recordedById: actor.id,
        },
      });
      const evaluation = await tx.courseEvaluation.create({
        data: { courseId: course.id, title: 'Validación', weight: 100, maxScore: 100 },
      });
      await tx.evaluationGrade.create({
        data: { evaluationId: evaluation.id, enrollmentId: enrollment.id, score: 85, recordedById: actor.id },
      });
      const verified = await tx.enrollment.findUnique({
        where: { id: enrollment.id },
        include: {
          attendance: true,
          grades: true,
          course: { include: { sessions: true, evaluations: true } },
        },
      });
      if (verified.attendance.length !== 1 || verified.grades.length !== 1)
        throw new Error('Prisma academic relations failed.');
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT compatibility_fixture');
      validation = {
        existingUsers: users.length,
        existingCourses: courses.length,
        profileFields: true,
        sessionReadWrite: true,
        attendanceReadWrite: true,
        instructorAttendanceReadWrite: true,
        evaluationReadWrite: true,
        gradeReadWrite: true,
        temporaryFixturesRolledBack: true,
      };
      if (!apply) throw rollback;
    },
    { timeout: 120000, maxWait: 30000 },
  );
  const result = {
    applied: true,
    sha256: createHash('sha256').update(sql).digest('hex'),
    completedAt: new Date().toISOString(),
    validation,
  };
  await writeFile(
    new URL('../.local/workflow-compatibility-result.json', import.meta.url),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  if (error === rollback)
    console.log(JSON.stringify({ applied: false, validated: true, rolledBack: true, validation }));
  else {
    console.error('Compatibility transaction rolled back:', error.code ?? error.message);
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
