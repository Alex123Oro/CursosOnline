import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

// Validate atomically and roll back by default. --apply commits the same checks.
const apply = process.argv.includes('--apply');
const sql = await readFile(new URL('../prisma/migrations/20261022150000_participant_email_registration/migration.sql', import.meta.url), 'utf8');
const sha256 = createHash('sha256').update(sql).digest('hex');
const statements = [];
let offset = 0;
for (const token of sql.matchAll(/(\$\w*\$)[\s\S]*?\1|'(?:''|[^'])*'|--[^\n]*|;/g)) {
  if (token[0] !== ';') continue;
  const statement = sql.slice(offset, token.index).trim();
  offset = token.index + 1;
  if (statement) statements.push(statement);
}
assert.equal(statements.length, 9, 'Review migration structure before applying.');
assert.equal(sql.slice(offset).trim(), '');
const db = new PrismaClient();
const rollback = new Error('VALIDATED_ROLLBACK');
const snapshot = async tx => {
  const [row] = await tx.$queryRawUnsafe(`SELECT count(*)::integer AS count,
    md5(coalesce(jsonb_agg(to_jsonb(u)-'registro_publico'-'correo_verificado_en' ORDER BY id)::text,'[]')) AS digest
    FROM public.usuarios u`);
  return row;
};
let validation;
try {
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout='5s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout='30s'");
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(22150000)');
    await tx.$executeRawUnsafe('LOCK TABLE public.usuarios IN SHARE MODE');
    const before = await snapshot(tx);
    if (apply) {
      const definitions = await tx.$queryRawUnsafe("SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='crear_usuario_desde_auth'");
      const triggers = await tx.$queryRawUnsafe("SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal");
      const grants = await tx.$queryRawUnsafe("SELECT grantee,privilege_type FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='usuarios'");
      const directory = new URL('../.local/', import.meta.url);
      await mkdir(directory, { recursive: true });
      await writeFile(new URL(`registration-before-${Date.now()}.json`, directory), JSON.stringify({ sha256, before, definitions, triggers, grants }, null, 2), { flag: 'wx', mode: 0o600 });
    }
    for (let iteration = 0; iteration < 2; iteration++) {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    }
    assert.deepEqual(await snapshot(tx), before, 'Existing profiles changed.');
    const [access] = await tx.$queryRawUnsafe(`SELECT
      NOT has_table_privilege('anon','public.usuarios','SELECT,INSERT,UPDATE,DELETE') AS anon_closed,
      NOT has_table_privilege('authenticated','public.usuarios','SELECT,INSERT,UPDATE,DELETE') AS authenticated_closed,
      has_table_privilege('service_role','public.usuarios','SELECT') AND
      has_table_privilege('service_role','public.usuarios','INSERT') AND
      has_table_privilege('service_role','public.usuarios','UPDATE') AS backend_access`);
    assert.deepEqual(access, { anon_closed: true, authenticated_closed: true, backend_access: true });
    const [trigger] = await tx.$queryRawUnsafe("SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='crear_usuario_al_registrarse'");
    assert.match(trigger.definition, /UPDATE OF email, email_confirmed_at/);
    validation = { existingProfilesPreserved: true, profiles: before.count, idempotent: true, verifiedEmailTrigger: true, ...access };
    if (!apply) throw rollback;
  }, { timeout: 90000, maxWait: 10000 });
  console.log(JSON.stringify({ applied: true, sha256, validation }));
} catch (error) {
  if (error === rollback) console.log(JSON.stringify({ applied: false, validated: true, rolledBack: true, sha256, validation }));
  else {
    console.error(JSON.stringify({ applied: false, rolledBack: true, error: error.code ?? error.name ?? 'VALIDATION_FAILED',
      ...(error instanceof assert.AssertionError ? { reason: error.message.split('\n')[0] } : {}) }));
    process.exitCode = 1;
  }
} finally { await db.$disconnect(); }
