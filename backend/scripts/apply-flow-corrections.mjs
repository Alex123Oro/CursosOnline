import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

// Targeted upgrade of the existing schema. Never reset or replay historical migrations.
const apply = process.argv.includes('--apply');
const migrations = await Promise.all(['20261023010000_enrollment_lifecycle','20261023011000_flow_consistency','20261023012000_certificate_corrections'].map(async name => {
  const sql = await readFile(new URL(`../prisma/migrations/${name}/migration.sql`,import.meta.url),'utf8');
  const statements = []; let offset = 0;
  for (const token of sql.matchAll(/(\$\w*\$)[\s\S]*?\1|'(?:''|[^'])*'|--[^\n]*|;/g)) {
    if (token[0] !== ';') continue;
    const statement = sql.slice(offset,token.index).trim(); offset = token.index+1;
    if (statement) statements.push(statement);
  }
  assert.equal(sql.slice(offset).trim(),'');
  return { name, statements, sha256: createHash('sha256').update(sql).digest('hex') };
}));
const db = new PrismaClient(); const rollback = new Error('VALIDATED_ROLLBACK');
const tables = ['usuarios','cursos','inscripciones','pagos','precios_curso','tipos_participante','sesiones','asistencias_participantes',
  'asistencias_instructores','evaluaciones','calificaciones','resultados_curso','resultados_academicos_curso','certificados','anulaciones_certificados','plantillas_certificados'];
async function snapshot(tx) {
  const result = [];
  for (const table of tables) {
    const expression = table === 'inscripciones' ? "to_jsonb(t)-'cerrada_en'-'motivo_cierre'"
      : table === 'certificados' ? "(to_jsonb(t)-'inscripcion_id'-'reemplaza_certificado_id'-'motivo_reemision'-'estado') || jsonb_build_object('verifiedStatus',CASE WHEN t.estado::text='anulado' OR EXISTS(SELECT 1 FROM public.anulaciones_certificados a WHERE a.certificado_id=t.id) THEN 'REVOKED' ELSE 'VALID' END)" : 'to_jsonb(t)';
    const [row] = await tx.$queryRawUnsafe(`SELECT '${table}' AS name,count(*)::integer AS count,md5(coalesce(jsonb_agg(${expression} ORDER BY id)::text,'[]')) AS digest FROM public."${table}" t`);
    result.push(row);
  }
  return result;
}
const execute = async (tx,migration) => { for (const statement of migration.statements) await tx.$executeRawUnsafe(statement); };
let stage = 'connect', validation;
try {
  // PostgreSQL requires enum additions to commit before newly added values are used.
  // These additions alone do not alter any business row.
  if (apply) { stage = 'enum'; await db.$transaction(tx => execute(tx,migrations[0])); }
  await db.$transaction(async tx => {
    stage = 'lock';
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout='5s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout='30s'");
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(23010000)');
    await tx.$executeRawUnsafe(`LOCK TABLE ${tables.map(t => `public."${t}"`).join(',')} IN SHARE MODE`);
    const before = await snapshot(tx);
    if (apply) {
      const definitions = await tx.$queryRawUnsafe("SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'");
      const constraints = await tx.$queryRawUnsafe("SELECT c.conname,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'");
      const directory = new URL('../.local/',import.meta.url); await mkdir(directory,{recursive:true});
      await writeFile(new URL(`flow-corrections-before-${Date.now()}.json`,directory),JSON.stringify({migrations:migrations.map(({name,sha256})=>({name,sha256})),before,definitions,constraints},null,2),{mode:0o600,flag:'wx'});
    }
    stage = 'migration';
    for (const migration of migrations) await execute(tx,migration);
    const historySnapshot = () => tx.$queryRawUnsafe("SELECT (SELECT md5(coalesce(jsonb_agg(to_jsonb(m) ORDER BY id)::text,'[]')) FROM movimientos_pago m) AS payments,(SELECT md5(coalesce(jsonb_agg(to_jsonb(h) ORDER BY id)::text,'[]')) FROM historial_inscripciones h) AS enrollments");
    const history = await historySnapshot();
    for (const migration of migrations) await execute(tx,migration);
    stage = 'preservation';
    assert.deepEqual(await snapshot(tx),before,'Existing business data or public certificate status changed.');
    assert.deepEqual(await historySnapshot(),history,'Reapplication duplicated or changed history.');
    const [ledger] = await tx.$queryRawUnsafe("SELECT count(*)::integer AS mismatches FROM pagos p WHERE p.monto IS DISTINCT FROM (SELECT sum(m.monto) FROM movimientos_pago m WHERE m.inscripcion_id=p.inscripcion_id)");
    assert.equal(ledger.mismatches,0,'Payment ledger differs from existing balances.');
    const [access] = await tx.$queryRawUnsafe("SELECT count(*)::integer AS exposed FROM pg_class c CROSS JOIN pg_roles r WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('movimientos_pago','historial_inscripciones') AND r.rolname IN ('anon','authenticated') AND (NOT c.relrowsecurity OR has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE'))");
    assert.equal(access.exposed,0,'History tables are publicly accessible.');
    validation = {businessDataPreserved:true,certificateStatusPreserved:true,paymentBalancesPreserved:true,idempotent:true,historyProtected:true,tablesChecked:tables.length};
    if (!apply) throw rollback;
  },{timeout:120000,maxWait:10000});
  console.log(JSON.stringify({applied:true,validation}));
} catch (error) {
  if (error === rollback) console.log(JSON.stringify({applied:false,validated:true,rolledBack:true,validation}));
  else { console.error(JSON.stringify({applied:false,rolledBack:true,stage,error:error.code ?? error.name,...(error instanceof assert.AssertionError?{reason:error.message.split('\n')[0]}:{})})); process.exitCode=1; }
} finally { await db.$disconnect(); }
