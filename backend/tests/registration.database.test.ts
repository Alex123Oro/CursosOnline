import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const container = process.env.CERTIFICATE_TEST_CONTAINER ?? '';
const database = 'eva_registration_test';
const migration = readFileSync(new URL('../prisma/migrations/20261022150000_participant_email_registration/migration.sql', import.meta.url), 'utf8');
const run = (sql: string) => spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', timeout: 20000 });
const query = (sql: string) => {
  const result = run(sql);
  if (result.status !== 0) throw new Error(result.stderr || String(result.error));
  return result.stdout.trim();
};
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pending = (n: number, email: string, metadata: Record<string, unknown> = { registration_source: 'eva-participant', nombre_completo: 'Ana Pérez' }) =>
  `INSERT INTO auth.users(id,email,raw_user_meta_data,confirmation_sent_at) VALUES('${id(n)}','${email}','${JSON.stringify(metadata).replace(/'/g, "''")}',now());`;
const confirm = (n: number) => `UPDATE auth.users SET email_confirmed_at=now() WHERE id='${id(n)}';`;

describe.skipIf(!container)('participant registration SQL (isolated Docker only)', () => {
  beforeAll(() => {
    if (!container.startsWith('eva-certificates-test-')) throw new Error('Unsafe test container');
    const label = spawnSync('docker', ['inspect', '--format', '{{index .Config.Labels "eva.certificates.test"}}', container], { encoding: 'utf8' });
    if (label.status !== 0 || label.stdout.trim() !== 'true') throw new Error('Missing isolated-test label');
    const exists = spawnSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-c', `SELECT 1 FROM pg_database WHERE datname='${database}'`], { encoding: 'utf8' });
    if (exists.status !== 0) throw new Error('Cannot inspect isolated DB');
    if (exists.stdout.trim() !== '1') {
      const created = spawnSync('docker', ['exec', container, 'createdb', '-U', 'postgres', database], { encoding: 'utf8' });
      if (created.status !== 0) throw new Error('Cannot create isolated registration DB');
    }
    query(`DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE;
      CREATE SCHEMA public; CREATE SCHEMA auth;
      DO $$ BEGIN
        IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
      END $$;
      CREATE TYPE public.rol_usuario AS ENUM('administrador','participante','instructor');
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,email_confirmed_at timestamptz,
        confirmation_sent_at timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
      CREATE TABLE public.tipos_participante(id serial PRIMARY KEY,nombre text UNIQUE NOT NULL);
      CREATE TABLE public.usuarios(id serial PRIMARY KEY,auth_id uuid UNIQUE NOT NULL,
        nombre_completo text NOT NULL,correo text UNIQUE NOT NULL,rol public.rol_usuario NOT NULL DEFAULT 'participante',
        tipo_participante_id integer REFERENCES public.tipos_participante(id));`);
    query(migration);
  }, 30000);

  it('creates no profile or discount before email confirmation', () => {
    query(pending(1, 'ana@est.umss.edu'));
    expect(query(`SELECT count(*) FROM public.usuarios WHERE auth_id='${id(1)}';`)).toBe('0');
  });
  it.each([[1, 'ana@est.umss.edu'], [2, 'ana@ms.umss.edu']])('assigns student category only after confirming institutional email (%s)', (n, email) => {
    if (n !== 1) query(pending(n, email));
    query(confirm(n));
    expect(query(`SELECT u.rol::text||'|'||t.nombre||'|'||u.registro_publico||'|'||(u.correo_verificado_en IS NOT NULL) FROM public.usuarios u JOIN public.tipos_participante t ON t.id=u.tipo_participante_id WHERE u.auth_id='${id(n)}';`)).toBe('participante|Estudiante|true|true');
  });
  it.each([[3, 'ana@example.test'], [4, 'ana@est.umss.edu.evil.test'], [5, 'ana@umss.edu'], [6, 'ana@fake.est.umss.edu']])('assigns external category to other verified domains (%s)', (n, email) => {
    query(pending(n, email) + confirm(n));
    expect(query(`SELECT t.nombre FROM public.usuarios u JOIN public.tipos_participante t ON t.id=u.tipo_participante_id WHERE u.auth_id='${id(n)}';`)).toBe('Externo');
  });
  it('ignores forged metadata for role, category and verification', () => {
    query(pending(7, 'forged@example.test', { registration_source: 'eva-participant', nombre_completo: 'Role Test', role: 'ADMIN', participantTypeId: 1, email_verified: true }));
    expect(query(`SELECT count(*) FROM public.usuarios WHERE auth_id='${id(7)}';`)).toBe('0');
    query(confirm(7));
    expect(query(`SELECT rol::text FROM public.usuarios WHERE auth_id='${id(7)}';`)).toBe('participante');
  });
  it('does not provision auto-confirmed identities without an email challenge', () => {
    query(`INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES('${id(8)}','auto@est.umss.edu',now(),'{"registration_source":"eva-participant","nombre_completo":"Auto Test"}');`);
    expect(query(`SELECT count(*) FROM public.usuarios WHERE auth_id='${id(8)}';`)).toBe('0');
  });
  it('preserves existing managed roles and categories', () => {
    query(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${id(9)}','legacy@example.test',now());
      INSERT INTO public.usuarios(auth_id,nombre_completo,correo,rol,tipo_participante_id) SELECT '${id(9)}','Existing Admin','legacy@example.test','administrador',id FROM public.tipos_participante WHERE nombre='Externo';
      UPDATE auth.users SET email='legacy@est.umss.edu' WHERE id='${id(9)}';`);
    expect(query(`SELECT rol::text||'|'||correo||'|'||registro_publico FROM public.usuarios WHERE auth_id='${id(9)}';`)).toBe('administrador|legacy@example.test|false');
  });
  it('leaves instructor creation to the administrator service', () => {
    query(`INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES('${id(10)}','instructor@example.test',now(),'{"name":"Instructor"}');`);
    expect(query(`SELECT count(*) FROM public.usuarios WHERE auth_id='${id(10)}';`)).toBe('0');
  });
  it('reclassifies a public participant after a confirmed email change', () => {
    query(`UPDATE auth.users SET email='ana-new@example.test' WHERE id='${id(1)}';`);
    expect(query(`SELECT t.nombre||'|'||u.correo FROM public.usuarios u JOIN public.tipos_participante t ON t.id=u.tipo_participante_id WHERE u.auth_id='${id(1)}';`)).toBe('Externo|ana-new@example.test');
  });
  it('refuses to rebind a different profile by email', () => {
    query(`INSERT INTO public.usuarios(auth_id,nombre_completo,correo,rol) VALUES('${id(20)}','Reserved Admin','reserved@example.test','administrador');`);
    query(pending(11, 'reserved@example.test'));
    expect(run(confirm(11)).status).not.toBe(0);
    expect(query("SELECT auth_id::text||'|'||rol::text FROM public.usuarios WHERE correo='reserved@example.test';")).toBe(`${id(20)}|administrador`);
  });
  it('does not allow clients to alter protected profile fields directly', () => {
    expect(run('SET ROLE authenticated; UPDATE public.usuarios SET rol=\'administrador\';').status).not.toBe(0);
    expect(run('SET ROLE anon; SELECT * FROM public.usuarios;').status).not.toBe(0);
  });
  it('reapplies safely without changing profiles or duplicating the trigger', () => {
    const before = query('SELECT jsonb_agg(to_jsonb(u) ORDER BY id)::text FROM public.usuarios u;');
    query(migration);
    expect(query('SELECT jsonb_agg(to_jsonb(u) ORDER BY id)::text FROM public.usuarios u;')).toBe(before);
    expect(query("SELECT count(*) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal;")).toBe('1');
  });
});
