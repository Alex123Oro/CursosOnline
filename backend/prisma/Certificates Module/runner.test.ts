import { describe, expect, it, vi } from 'vitest';
import { runSeed, type SeedPorts } from './runner.js';
import { buildFixtures, accounts, laPazToday, shiftDate } from './fixtures.js';
import { certificateTemplateInputSchema } from '../../src/modules/certificates/certificate-template.rules.js';

function ports() {
  return {
    preflight: vi.fn().mockResolvedValue(undefined),
    readManifest: vi.fn().mockResolvedValue(null),
    validateExisting: vi.fn().mockResolvedValue(undefined),
    assertVacant: vi.fn().mockResolvedValue(undefined),
    saveManifest: vi.fn().mockResolvedValue(undefined),
    createAccount: vi.fn().mockImplementation(async account => ({ key: account.key, authId: `auth-${account.key}` })),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
    confirmRollback: vi.fn().mockResolvedValue(true),
    populate: vi.fn().mockResolvedValue({ users: [], courses: [], templates: [], enrollments: [], certificates: [] })
  } satisfies SeedPorts;
}

describe('certificate demo orchestration (no network)', () => {
  it('defaults to read-only checks without creating users, data or manifest', async () => {
    const p = ports();
    expect((await runSeed(p, { today: '2026-10-26' })).status).toBe('checked');
    expect(p.preflight).toHaveBeenCalledOnce();
    expect(p.assertVacant).toHaveBeenCalledOnce();
    for (const fn of [p.saveManifest, p.createAccount, p.populate, p.deleteAccount]) expect(fn).not.toHaveBeenCalled();
  });
  it('stops before writes on invalid configuration or collisions', async () => {
    for (const stage of ['preflight', 'assertVacant'] as const) {
      const p = ports(); p[stage].mockRejectedValue(new Error(stage));
      await expect(runSeed(p, { apply: true, today: '2026-10-26' })).rejects.toThrow(stage);
      expect(p.createAccount).not.toHaveBeenCalled(); expect(p.populate).not.toHaveBeenCalled();
    }
  });
  it('creates 14 accounts before one atomic population and records completion', async () => {
    const p = ports();
    const result = await runSeed(p, { apply: true, today: '2026-10-26' });
    expect(result.status).toBe('complete');
    expect(p.createAccount).toHaveBeenCalledTimes(14);
    expect(p.populate).toHaveBeenCalledOnce();
    expect(p.populate.mock.invocationCallOrder[0]).toBeGreaterThan(p.createAccount.mock.invocationCallOrder.at(-1)!);
    expect(p.saveManifest.mock.calls.at(-1)![0].status).toBe('complete');
  });
  it('preserves dates and demo changes on rerun without writes', async () => {
    const p = ports();
    p.readManifest.mockResolvedValue({ status: 'complete', today: '2026-10-26' } as never);
    expect((await runSeed(p, { apply: true, today: '2027-01-01' })).status).toBe('existing');
    expect(p.validateExisting).toHaveBeenCalledOnce();
    for (const fn of [p.createAccount, p.populate, p.saveManifest, p.deleteAccount]) expect(fn).not.toHaveBeenCalled();
  });
  it('refuses partial manifests, including a committed database without a final manifest', async () => {
    const p = ports(); p.readManifest.mockResolvedValue({ status: 'preparing' } as never);
    await expect(runSeed(p, { apply: true, today: '2026-10-26' })).rejects.toThrow(/parcial/);
    expect(p.createAccount).not.toHaveBeenCalled();
  });
  it('compensates only accounts created in this invocation after rollback', async () => {
    const p = ports(); p.populate.mockRejectedValue(new Error('rollback'));
    await expect(runSeed(p, { apply: true, today: '2026-10-26' })).rejects.toThrow(/rollback/);
    expect(p.deleteAccount).toHaveBeenCalledTimes(14);
    expect(p.saveManifest.mock.calls.at(-1)![0]).toMatchObject({ status: 'failed', orphanAuthIds: [] });
  });
  it('records failed compensation and accounts created before a later Auth failure', async () => {
    const p = ports();
    p.createAccount.mockResolvedValueOnce({ key: 'admin', authId: 'created-only' }).mockRejectedValueOnce(new Error('auth unavailable'));
    p.deleteAccount.mockRejectedValue(new Error('delete unavailable'));
    await expect(runSeed(p, { apply: true, today: '2026-10-26' })).rejects.toThrow(/created-only/);
    expect(p.deleteAccount).toHaveBeenCalledExactlyOnceWith('created-only');
  });
  it('does not delete Auth accounts if final manifest fails after DB commit', async () => {
    const p = ports();
    p.saveManifest.mockImplementation(async manifest => { if (manifest.status === 'complete') throw new Error('disk full'); });
    await expect(runSeed(p, { apply: true, today: '2026-10-26' })).rejects.toThrow(/confirmada/);
    expect(p.deleteAccount).not.toHaveBeenCalled();
  });
  it('keeps Auth identities when rollback cannot be confirmed after a connection failure', async () => {
    const p = ports(); p.populate.mockRejectedValue(new Error('connection lost'));
    p.confirmRollback.mockResolvedValue(false);
    await expect(runSeed(p, { apply: true, today: '2026-10-26' })).rejects.toThrow(/confirmar/);
    expect(p.deleteAccount).not.toHaveBeenCalled();
    expect(p.saveManifest.mock.calls.at(-1)![0].orphanAuthIds).toHaveLength(14);
  });
});

describe('demo fixture matrix', () => {
  it('uses La Paz dates across UTC midnight and validates calendar input', () => {
    expect(laPazToday(new Date('2026-10-27T02:00:00Z'))).toBe('2026-10-26');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(() => shiftDate('2026-02-30', 0)).toThrow();
  });
  it('uses valid templates for both types and weights totaling 100', () => {
    const f = buildFixtures('2026-10-26');
    expect(f.templates.map(t => t.type)).toEqual(['aprobacion', 'participacion']);
    for (const t of f.templates) {
      const { key, ...input } = t;
      expect(certificateTemplateInputSchema.safeParse(input).success).toBe(true);
      expect(key).toContain(t.type);
    }
    for (const c of f.courses) expect(c.evaluations.reduce((total, e) => total + e.weight, 0)).toBe(100);
  });
  it('contains unique identities and four isolated courses with coherent relative dates', () => {
    const f = buildFixtures('2026-10-26');
    expect(accounts).toHaveLength(14); expect(new Set(accounts.map(a => a.email)).size).toBe(14);
    expect(f.courses).toHaveLength(4);
    for (const c of f.courses) { expect(c.code).toMatch(/^DEMO-S3-CERT-/); expect(c.name).toContain('DEMOSTRACION SIN VALIDEZ ACADEMICA'); }
    expect(f.courses[0]!.endDate < '2026-10-26').toBe(true);
    expect(f.courses[1]!.sessions.some(s => s.date > '2026-10-26')).toBe(true);
    expect(f.courses[2]!.sessions).toHaveLength(0); expect(f.courses[3]!.durationHours).toBeNull();
    expect(f.enrollments).toHaveLength(15);
    expect(f.enrollments.filter(e => e.participant === 'p12').map(e => e.course)).toEqual(['future']);
  });
  it('pins exact thresholds, pending grades and attendance to five sessions', () => {
    const f = buildFixtures('2026-10-26');
    const main = f.enrollments.filter(e => e.course === 'main');
    expect(main).toHaveLength(11);
    expect(main.find(e => e.participant === 'p02')).toMatchObject({ grades: [70, 70], present: 4 });
    expect(main.find(e => e.participant === 'p04')).toMatchObject({ grades: [60, 60], present: 5 });
    expect(main.find(e => e.participant === 'p05')).toMatchObject({ grades: [90, 90], present: 3 });
    expect(main.find(e => e.participant === 'p06')!.grades).toEqual([90, null]);
    expect(main.find(e => e.participant === 'p08')!.grades).toEqual([null, null]);
    expect(main.find(e => e.participant === 'p11')!.status).toBe('PREINSCRITO');
    for (const e of f.enrollments) { expect(accounts.some(a => a.key === e.participant)).toBe(true); expect(e.present).toBeLessThanOrEqual(f.courses.find(c => c.key === e.course)!.sessions.length); }
  });
});
