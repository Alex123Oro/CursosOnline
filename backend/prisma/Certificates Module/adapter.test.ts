import { describe, expect, it } from 'vitest';
import { validateConfig, populateDatabase, createPorts } from './adapter.js';
import { Prisma } from '@prisma/client';
import { accounts, buildFixtures } from './fixtures.js';
import { vi } from 'vitest';

const settings = {
  SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  DATABASE_URL: 'postgresql://postgres.abcdefghijklmnopqrst:test@aws-0-ca-central-1.pooler.supabase.com:5432/postgres',
  PUBLIC_APP_URL: 'http://localhost:4200'
};
describe('certificate seed configuration', () => {
  const local = { ...settings, CERTIFICATES_DEMO_TARGET: 'local', SUPABASE_URL: 'http://127.0.0.1:54321', DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', DIRECT_URL: 'postgresql://postgres:postgres@localhost:54322/postgres' };
  it('accepts only the explicitly selected local stack and uses a separate identity', () => {
    expect(validateConfig(local).projectRef).toBe('local-cursosonline-certificates');
  });
  it('rejects mixed local/cloud endpoints, other ports, and local endpoints without opt-in', () => {
    for (const override of [
      { CERTIFICATES_DEMO_TARGET: '' }, { CERTIFICATES_DEMO_TARGET: 'typo' },
      { DATABASE_URL: settings.DATABASE_URL }, { DIRECT_URL: settings.DATABASE_URL },
      { SUPABASE_URL: settings.SUPABASE_URL }, { SUPABASE_URL: 'http://192.168.1.2:54321' },
      { DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres' },
      { SUPABASE_URL: 'http://127.0.0.1:54322' }
    ]) expect(() => validateConfig({ ...local, ...override })).toThrow();
  });
  it('accepts matching pooler and direct connections and normalizes public origin', () => {
    expect(validateConfig(settings).projectRef).toBe('abcdefghijklmnopqrst');
    expect(validateConfig({ ...settings, DATABASE_URL: 'postgresql://postgres:test@db.abcdefghijklmnopqrst.supabase.co:5432/postgres' }).publicUrl).toBe('http://localhost:4200');
  });
  it('rejects missing keys, wrong projects, malformed origins and signing overrides without echoing secrets', () => {
    for (const override of [
      { SUPABASE_SECRET_KEY: '' }, { SUPABASE_PUBLISHABLE_KEY: '' },
      { DATABASE_URL: 'postgresql://postgres.otherproject:test@aws-0-ca-central-1.pooler.supabase.com:5432/postgres' },
      { DIRECT_URL: 'postgresql://postgres:test@db.otherproject.supabase.co:5432/postgres' },
      { DATABASE_URL: `${settings.DATABASE_URL}?schema=other` },
      { DATABASE_URL: `${settings.DATABASE_URL}?schema=public&schema=other` },
      { DATABASE_URL: settings.DATABASE_URL.replace(/\/postgres$/, '/unrelated_database') },
      { PUBLIC_APP_URL: 'http://localhost:4200/verificar' }, { PUBLIC_APP_URL: 'http://user:password@localhost:4200' },
      { PUBLIC_APP_URL: 'http://localhost:4200?secret=test' }, { PDF_SIGNING_P12_PATH: '/private/key.p12' },
      { PDF_SIGNING_DEMO: 'true' }, { NODE_ENV: 'production' }
    ]) expect(() => validateConfig({ ...settings, ...override })).toThrow();
  });
});

describe('read-only schema preflight', () => {
  function preflightMock(trigger = true, legacyColumn = 'hora_inicio') {
    const columns: { table_name: string; column_name: string; is_nullable: string; column_default: string | null; is_identity: string; is_generated: string }[] = [];
    for (const model of Prisma.dmmf.datamodel.models) for (const field of model.fields.filter(f => f.kind !== 'object')) {
      columns.push({ table_name: model.dbName ?? model.name, column_name: field.dbName ?? field.name, is_nullable: 'YES', column_default: null, is_identity: 'NO', is_generated: 'NEVER' });
    }
    for (const [table, names] of Object.entries({
      certificados: ['id','resultado_curso_id','inscripcion_id','datos_emision','reemplaza_certificado_id','motivo_reemision'],
      resultados_curso: ['id','inscripcion_id','nota_final','porcentaje_asistencia','cumple_nota','cumple_asistencia','estado'],
      anulaciones_certificados: ['id','certificado_id','anulado_por','motivo'],
      plantillas_certificados: ['id','nombre','tipo','config','clave_inicial','version','creado_por','actualizado_por']
    })) for (const name of names) columns.push({ table_name: table, column_name: name, is_nullable: 'YES', column_default: null, is_identity: 'NO', is_generated: 'NEVER' });
    columns.push({ table_name: 'sesiones', column_name: legacyColumn, is_nullable: 'NO', column_default: null, is_identity: 'NO', is_generated: 'NEVER' });
    const db = { $queryRaw: vi.fn(async (sql: TemplateStringsArray) => {
      if (String(sql).includes('information_schema.columns')) return columns;
      if (String(sql).includes('pg_trigger')) return [{ available: trigger }];
      if (String(sql).includes('to_regprocedure')) return [{ available: true }];
      return [];
    }), participantType: { findUnique: vi.fn(async () => ({ id: 1 })) } };
    const createUser = vi.fn(); const deleteUser = vi.fn();
    const auth = { from: vi.fn(() => ({ select: () => ({ limit: async () => ({ error: null }) }) })), auth: { admin: { listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })), createUser, deleteUser } } };
    return { db, auth, createUser, deleteUser, ports: createPorts(db as never, auth as never, validateConfig(settings), 'not-used.json') };
  }
  it('accepts legacy session time columns populated by the existing compatibility trigger', async () => {
    const p = preflightMock();
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    try {
      await expect(p.ports.preflight()).resolves.toBeUndefined();
      expect(p.createUser).not.toHaveBeenCalled(); expect(p.deleteUser).not.toHaveBeenCalled();
    } finally { transport.mockRestore(); }
  });
  it('rejects unsupported required columns or missing compatibility trigger before network writes', async () => {
    for (const p of [preflightMock(false), preflightMock(true, 'unknown_required')]) {
      await expect(p.ports.preflight()).rejects.toThrow(/obligatoria|compatibilidad/);
      expect(p.createUser).not.toHaveBeenCalled();
    }
  });
});

describe('database population contract (mock transaction)', () => {
  function database() {
    let id = 0;
    const create = vi.fn(async ({ data }) => ({ id: ++id, ...data }));
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn(async (_sql: TemplateStringsArray) => [{ id: String(++id), certificate: { id: String(id) } }]),
      user: { create }, participantType: { findUnique: vi.fn(async () => ({ id: 1 })) },
      course: { create, findMany: vi.fn(async () => []) },
      certificateTemplate: {}, courseInstructor: { create }, coursePrice: { create },
      enrollment: { create }, courseSession: { create }, courseEvaluation: { create },
      attendance: { create }, evaluationGrade: { create }, payment: { create }
    };
    return { tx, $transaction: vi.fn(async callback => callback(tx)) };
  }
  it('creates all academic data before issuing through SQL functions, never through CourseResult', async () => {
    const db = database();
    const result = await populateDatabase(db as never, buildFixtures('2026-10-26'), accounts.map(a => ({ key: a.key, authId: `auth-${a.key}` })), 'http://localhost:4200');
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(result.users).toHaveLength(14); expect(result.courses).toHaveLength(4);
    expect(result.enrollments).toHaveLength(15); expect(result.templates).toHaveLength(2);
    expect(result.certificates).toHaveLength(5);
    expect(result.certificates.filter(c => c.initialStatus === 'VALID')).toHaveLength(3);
    expect(result.certificates.filter(c => c.initialStatus === 'REVOKED')).toHaveLength(2);
    const sql = db.tx.$queryRaw.mock.calls.map(call => String(call[0])).join('\n');
    expect(sql).toContain('emit_certificate_for_type'); expect(sql).toContain('emit_certificate_with_template');
    expect(sql).toContain('revoke_certificate'); expect(sql).toContain('reissue_certificate');
    expect(sql).not.toContain('resultados_academicos_curso');
    const issueCall = db.tx.$queryRaw.mock.calls.findIndex(call => String(call[0]).includes('emit_certificate_for_type'));
    expect(db.tx.$queryRaw.mock.invocationCallOrder[issueCall]).toBeGreaterThan(db.tx.evaluationGrade.create.mock.invocationCallOrder.at(-1)!);
    expect(result.certificates.every(c => /^[0-9A-F]{8}$/.test(c.code))).toBe(true);
    expect(result.certificates.at(-1)!.replacesId).toBe(result.certificates.at(-2)!.id);
  });
  it('propagates SQL errors out of the transaction so the runner can compensate', async () => {
    const db = database(); db.tx.$queryRaw.mockRejectedValue(new Error('rollback'));
    await expect(populateDatabase(db as never, buildFixtures('2026-10-26'), accounts.map(a => ({ key: a.key, authId: `auth-${a.key}` })), 'http://localhost:4200')).rejects.toThrow('rollback');
    expect(db.tx.$queryRaw).toHaveBeenCalledOnce();
  });
});
