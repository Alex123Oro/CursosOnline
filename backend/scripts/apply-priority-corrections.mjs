import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { Prisma, PrismaClient } from '@prisma/client';

// Default mode executes the complete migration and all assertions, then rolls back.
// No application records are inserted, updated, deleted, or recalculated here.
const apply = process.argv.includes('--apply');
const migration = new URL('../prisma/migrations/20261022100000_security_and_academic_rules/migration.sql', import.meta.url);
const sql = await readFile(migration, 'utf8');
const sha256 = createHash('sha256').update(sql).digest('hex');
const statements = [];
let offset = 0;
for (const token of sql.matchAll(/(\$\w*\$)[\s\S]*?\1|'(?:''|[^'])*'|--[^\n]*|;/g)) {
  if (token[0] !== ';') continue;
  const statement = sql.slice(offset, token.index).trim();
  offset = token.index + 1;
  if (statement) statements.push(statement);
}
assert.equal(statements.length, 8, 'Migration structure changed. Review the runner before applying.');
assert.equal(sql.slice(offset).trim(), '', 'Unterminated SQL statement.');
const tables = ['usuarios','cursos','inscripciones','pagos','precios_curso','tipos_participante','sesiones',
  'asistencias_participantes','asistencias_instructores','evaluaciones','calificaciones',
  'resultados_curso','resultados_academicos_curso','certificados','anulaciones_certificados','plantillas_certificados'];
const protectedTables = ['inscripciones','pagos','precios_curso','tipos_participante'];
const functions = ['certificate_assessment_for_type','certificate_assessment','emit_certificate_for_type','emit_certificate'];
const db = new PrismaClient();
const rollback = new Error('VALIDATED_ROLLBACK');
let validation;
let stage='connect';

async function snapshot(tx) {
  const rows = [];
  for (const table of tables) {
    const [row] = await tx.$queryRaw(Prisma.sql`SELECT ${table} AS name,count(*)::integer AS count,
      md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) AS digest FROM ${Prisma.raw(`public."${table}"`)} t`);
    rows.push(row);
  }
  return rows;
}

try {
  await db.$transaction(async tx => {
    stage='lock';
    await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
    await tx.$executeRaw`SET LOCAL statement_timeout='30s'`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(22100000)`;
    // Keep records stable while comparing their digests; access-control DDL is atomic.
    await tx.$executeRawUnsafe(`LOCK TABLE ${tables.map(table => `public."${table}"`).join(',')} IN SHARE MODE`);
    stage='snapshot';
    const before = await snapshot(tx);
    const definitions = await tx.$queryRaw`SELECT p.proname AS name,pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN (${Prisma.join(functions)})`;
    const grants = await tx.$queryRaw`SELECT table_name,grantee,privilege_type FROM information_schema.table_privileges
      WHERE table_schema='public' AND table_name IN (${Prisma.join(protectedTables)}) ORDER BY table_name,grantee,privilege_type`;
    const rls = await tx.$queryRaw`SELECT relname AS name,relrowsecurity AS enabled FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relname IN (${Prisma.join(protectedTables)}) ORDER BY relname`;
    if (apply) {
      const directory = new URL('../.local/',import.meta.url);
      await mkdir(directory,{ recursive:true });
      await writeFile(new URL(`priority-corrections-before-${Date.now()}.json`,directory),
        JSON.stringify({ sha256,before,definitions,grants,rls },null,2), { mode:0o600,flag:'wx' });
    }
    stage='migration';
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
    // A second application must also be safe and preserve every data row.
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
    stage='privileges';
    const publicAccess = await tx.$queryRaw`SELECT c.relname,r.rolname FROM pg_class c CROSS JOIN pg_roles r
      WHERE c.relnamespace='public'::regnamespace AND c.relname IN (${Prisma.join(protectedTables)})
      AND r.rolname IN ('anon','authenticated') AND
      (NOT c.relrowsecurity OR has_table_privilege(r.oid,c.oid,'SELECT') OR has_table_privilege(r.oid,c.oid,'INSERT')
        OR has_table_privilege(r.oid,c.oid,'UPDATE') OR has_table_privilege(r.oid,c.oid,'DELETE'))`;
    assert.equal(publicAccess.length,0,'Public access remains enabled. All changes will be rolled back.');
    const serviceAccess = await tx.$queryRaw`SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace
      AND c.relname IN (${Prisma.join(protectedTables)}) AND NOT
      (has_table_privilege('service_role',c.oid,'SELECT') AND has_table_privilege('service_role',c.oid,'INSERT')
        AND has_table_privilege('service_role',c.oid,'UPDATE') AND has_table_privilege('service_role',c.oid,'DELETE'))`;
    assert.equal(serviceAccess.length,0,'The backend service role lost its required privileges.');
    stage='preservation';
    assert.deepEqual(await snapshot(tx),before,'Business data changed or backend reads were blocked.');
    validation = { publicAccessClosed:true,backendAccessPreserved:true,businessDataPreserved:true,
      idempotent:true,tablesChecked:tables.length };
    if (!apply) throw rollback;
  },{ timeout:90000,maxWait:10000 });
  console.log(JSON.stringify({ applied:true,sha256,validation }));
} catch (error) {
  if (error === rollback) console.log(JSON.stringify({ applied:false,validated:true,rolledBack:true,sha256,validation }));
  else {
    // Do not print SQL, connection strings or database-driver messages.
    console.error(JSON.stringify({ applied:false,rolledBack:true,stage,kind:error.name,
      error:error.code ?? error.errorCode ?? 'VALIDATION_FAILED',
      ...(error instanceof assert.AssertionError ? { reason:error.message.split('\n')[0] } : {}) }));
    process.exitCode=1;
  }
} finally { await db.$disconnect(); }
