import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

// This fixed migration is additive. Default mode validates everything and rolls back.
// The live database predates Prisma's migration history; do not reset or replay it.
const apply = process.argv.includes('--apply');
const sql = await readFile(new URL('../prisma/migrations/20261018100000_add_academic_management/migration.sql', import.meta.url), 'utf8');
const statements = [];
let offset = 0;
for (const token of sql.matchAll(/(\$\w*\$)[\s\S]*?\1|'(?:''|[^'])*'|--[^\n]*|;/g)) {
  if (token[0] !== ';') continue;
  const statement = sql.slice(offset, token.index).replace(/--[^\n]*/g, '').trim();
  offset = token.index + 1;
  if (statement) statements.push(statement);
}
assert.equal(statements.length, 8, 'Migration structure changed; review the runner.');
assert.equal(sql.slice(offset).trim(), '', 'Unterminated migration statement.');
const db = new PrismaClient();
const rollback = new Error('VALIDATED_ROLLBACK');
let validation;

async function certificateSnapshot(tx) {
  return tx.$queryRaw`
    SELECT 'results' AS name, count(*)::integer AS count,
      md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')) AS digest
      FROM public.resultados_curso t
    UNION ALL
    SELECT 'certificates', count(*)::integer,
      md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]'))
      FROM public.certificados t
    ORDER BY name`;
}

try {
  await db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    await tx.$executeRaw`SET LOCAL search_path = public`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(18100000)`;
    await tx.$executeRaw`LOCK TABLE public.resultados_curso, public.certificados IN SHARE MODE`;
    const before = await certificateSnapshot(tx);
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
    // A second run must preserve data and avoid duplicate legacy assignments.
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
    const assignments = await tx.courseInstructor.findMany({
      select: { id: true, course: { select: { id: true } }, instructor: { select: { id: true } } }
    });
    const [missing] = await tx.$queryRaw`
      SELECT count(*)::integer AS count FROM cursos c WHERE c.instructor_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM asignaciones_instructores a
        WHERE a.curso_id = c.id AND a.instructor_id = c.instructor_id)`;
    assert.equal(missing.count, 0, 'An existing instructor assignment was lost.');
    // Exercise generated Prisma CRUD inside a savepoint, including pending values.
    await tx.$executeRaw`SAVEPOINT academic_smoke`;
    const enrollment = await tx.enrollment.findFirst({ select: { id: true, courseId: true } });
    if (enrollment) {
      const result = await tx.courseResult.upsert({
        where: { enrollmentId: enrollment.id },
        create: { enrollmentId: enrollment.id, courseId: enrollment.courseId, status: 'PASSED', finalScore: 90, attendancePercent: 100 },
        update: { status: 'PASSED', finalScore: 90, attendancePercent: 100 }
      });
      assert.equal(result.status, 'PASSED');
      await tx.courseResult.updateMany({ where: { enrollmentId: enrollment.id }, data: {
        status: 'PENDING', finalScore: null, attendancePercent: null, calculatedAt: null
      } });
      const pending = await tx.courseResult.findUnique({ where: { enrollmentId: enrollment.id } });
      assert.equal(pending.status, 'PENDING');
      assert.equal(pending.finalScore, null);
      assert.equal(pending.attendancePercent, null);
    }
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT academic_smoke`;
    assert.deepEqual(await certificateSnapshot(tx), before, 'Certificate contents or issuance results changed.');
    validation = { assignments: assignments.length, prismaCrud: Boolean(enrollment), certificatesPreserved: true, idempotent: true };
    if (!apply) throw rollback;
  }, { timeout: 60000, maxWait: 15000 });
  console.log(JSON.stringify({ applied: true, validation, sha256: createHash('sha256').update(sql).digest('hex') }));
} catch (error) {
  if (error === rollback) console.log(JSON.stringify({ applied: false, validated: true, rolledBack: true, validation }));
  else {
    console.error('Academic migration rolled back:', error.code ?? error.message);
    process.exitCode = 1;
  }
} finally { await db.$disconnect(); }
