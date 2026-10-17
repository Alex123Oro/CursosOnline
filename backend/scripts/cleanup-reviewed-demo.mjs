import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient, Prisma } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

// Only the exact records listed in the user's reviewed local plan are eligible.
const email = 'maykel.zalazar@gmail.com';
const local = new URL('../.local/', import.meta.url);
const audit = JSON.parse(await readFile(new URL('real-environment-audit.json', local), 'utf8'));
const admin = JSON.parse(await readFile(new URL('admin-provisioning-result.json', local), 'utf8'));
if (!admin.apiVerified || admin.email !== email) throw new Error('Real administrator login must be verified first.');
const sql = await readFile(new URL('demo-cleanup-review.sql', local), 'utf8');
const operations = [...sql.matchAll(/DELETE FROM public\.([a-z_]+) WHERE id IN \(([0-9,]+)\);/g)].map(match => ({ table: match[1], ids: match[2].split(',') }));
const allowed = ['anulaciones_certificados','certificados','resultados_curso','calificaciones','asistencias_participantes','asistencias_instructores','pagos','inscripciones','preinscripciones','becas','precios_curso','evaluaciones','sesiones','cursos','usuarios_roles','usuarios'];
if (!operations.length || operations.some(op => !allowed.includes(op.table) || op.ids.some(id => !/^\d+$/.test(id))) || new Set(operations.map(op => op.table)).size !== operations.length) throw new Error('Unexpected cleanup plan.');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('connect_timeout','15');
url.searchParams.set('pool_timeout','30');
url.searchParams.set('connection_limit','1');
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const apply = process.argv.includes('--apply');
const rollback = new Error('REVIEW_VALIDATED_ROLLBACK');
let backup = {};
let deleted = {};
try {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    const profiles = await tx.$queryRaw`SELECT id::text AS id FROM public.usuarios WHERE correo=${email} AND auth_id=${admin.authId}::uuid AND rol::text='administrador' AND activo=true FOR SHARE`;
    if (profiles.length !== 1 || profiles[0].id !== admin.profileId) throw new Error('Real administrator profile is not ready.');
    for (const op of operations) {
      const table = Prisma.raw(`public.${op.table}`); // validated fixed table allowlist
      const ids = op.ids.map(id => BigInt(id));
      const current = await tx.$queryRaw(Prisma.sql`SELECT to_jsonb(t) AS row FROM ${table} t WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
      const expected = audit.tables[op.table]?.rows.filter(row => op.ids.includes(String(row.id))).sort((a,b) => Number(a.id)-Number(b.id));
      if (!expected || expected.length !== ids.length || !same(current.map(item => item.row), expected)) throw new Error(`Reviewed rows changed in ${op.table}; cleanup aborted.`);
      backup[op.table] = current.map(item => item.row);
    }
    // Save a new pre-delete snapshot without overwriting the earlier inventory.
    const backupName = `demo-cleanup-backup-${Date.now()}.json`;
    await writeFile(new URL(backupName, local), JSON.stringify({ generatedAt: new Date().toISOString(), rows: backup }, null, 2), { flag: 'wx' });
    for (const op of operations) {
      const table = Prisma.raw(`public.${op.table}`);
      const affected = await tx.$executeRaw(Prisma.sql`DELETE FROM ${table} WHERE id IN (${Prisma.join(op.ids.map(id => BigInt(id)))})`);
      if (affected !== op.ids.length) throw new Error(`Unexpected deletion count in ${op.table}`);
      deleted[op.table] = affected;
    }
    if (!apply) throw rollback;
  }, { timeout: 60000, maxWait: 30000 });
} catch (error) {
  if (error === rollback) { console.log(JSON.stringify({ validated: true, applied: false, rolledBack: true, rows: deleted })); process.exitCode = 0; }
  else { console.error('Cleanup rolled back:', error.code ?? error.message); process.exitCode = 1; }
  await prisma.$disconnect();
  process.exit(process.exitCode);
}
await prisma.$disconnect();
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) } });
const removedAuth = [];
const failures = [];
for (const user of audit.authDemoUsers) {
  if (!/@eva\.local$|^eva-instructor-test-.*@example\.com$/.test(user.email) || user.email === email) throw new Error('Unexpected Auth identity in cleanup plan.');
  const { data, error } = await db.auth.admin.getUserById(user.id);
  if (error?.status === 404) continue;
  if (error || data.user?.email !== user.email) { failures.push(user.email); continue; }
  const deletion = await db.auth.admin.deleteUser(user.id);
  if (deletion.error) failures.push(user.email); else removedAuth.push(user.email);
}
const result = { applied: true, completedAt: new Date().toISOString(), rows: deleted, removedAuth, authFailures: failures, realAdmin: email };
await writeFile(new URL('demo-cleanup-result.json', local), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (failures.length) process.exitCode = 1;
