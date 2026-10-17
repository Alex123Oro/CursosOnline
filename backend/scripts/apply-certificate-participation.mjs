import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

if (process.argv.includes('--check')) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }) }
  });
  const { data: courses, error } = await client.from('cursos').select('id').limit(1);
  if (error || !courses?.length) throw new Error('Cannot select a course for RPC verification.');
  for (const type of ['aprobacion','participacion']) {
    const result = await client.rpc('certificate_candidates_for_type', { p_course_id: String(courses[0].id), p_type: type });
    if (result.error) throw new Error(`RPC check failed: ${result.error.code}`);
    console.log(JSON.stringify({ type, rpc: true, students: result.data.students.length }));
  }
  process.exit(0);
}

// One fixed, reviewed migration. Default mode validates then rolls back DDL.
const apply = process.argv.includes('--apply');
const sql = await readFile(new URL('../prisma/migrations/20261016020000_certificate_participation/migration.sql', import.meta.url), 'utf8');
const sha256 = createHash('sha256').update(sql).digest('hex');
const statements = [];
let offset = 0;
for (const token of sql.matchAll(/(\$\w*\$)[\s\S]*?\1|'(?:''|[^'])*'|--[^\n]*|;/g)) {
  if (token[0] !== ';') continue;
  const statement = sql.slice(offset, token.index).replace(/--[^\n]*/g, '').trim();
  offset = token.index + 1;
  if (statement && !/^(BEGIN|COMMIT)$/i.test(statement)) statements.push(statement);
}
if (statements.length !== 11) throw new Error('Unexpected migration structure; review required.');
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('connect_timeout', '15');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const rollback = new Error('VALIDATED_ROLLBACK');
let validation;
try {
  await db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    const [existing] = await tx.$queryRaw`SELECT count(*)::integer AS count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('certificate_assessment_for_type','certificate_candidates_for_type','emit_certificate_for_type')`;
    if (existing.count !== 0) throw new Error('Participation functions already exist; do not reapply.');
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
    const [counts] = await tx.$queryRaw`SELECT count(*)::integer AS courses FROM public.cursos`;
    const checked = await tx.$queryRaw`SELECT c.id::text AS id, public.certificate_candidates_for_type(c.id,'aprobacion') IS NOT NULL AS approval, public.certificate_candidates_for_type(c.id,'participacion') IS NOT NULL AS participation FROM public.cursos c`;
    if (checked.length !== counts.courses || checked.some(row => !row.approval || !row.participation)) throw new Error('Roster validation failed.');
    const [permissions] = await tx.$queryRaw`SELECT has_function_privilege('anon','public.emit_certificate_for_type(bigint,text,text,bigint,text)','EXECUTE') AS anonymous, has_function_privilege('authenticated','public.emit_certificate_for_type(bigint,text,text,bigint,text)','EXECUTE') AS authenticated, has_function_privilege('service_role','public.emit_certificate_for_type(bigint,text,text,bigint,text)','EXECUTE') AS server`;
    if (permissions.anonymous || permissions.authenticated || !permissions.server) throw new Error('RPC permission validation failed.');
    validation = { courses: counts.courses, permissions };
    if (!apply) throw rollback;
  }, { timeout: 60000, maxWait: 10000 });
  console.log(JSON.stringify({ applied: true, sha256, validation }));
} catch (error) {
  if (error === rollback) console.log(JSON.stringify({ applied: false, validated: true, rolledBack: true, sha256, validation }));
  else {
    console.error('Participation migration failed and was rolled back. Code:', error.code ?? error.message);
    process.exitCode = 1;
  }
} finally { await db.$disconnect(); }
