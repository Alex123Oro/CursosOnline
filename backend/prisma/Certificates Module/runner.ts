import { accounts, buildFixtures, seedId, type DemoAccount, type DemoFixtures } from './fixtures.js';

export type AuthAccount = { key: string; authId: string };
export type Reference = { key: string; id: string };
export type Population = {
  users: (Reference & { authId: string; email: string })[];
  courses: (Reference & { code: string })[];
  templates: Reference[];
  enrollments: (Reference & { participant: string; course: string })[];
  certificates: (Reference & { code: string; url: string; enrollmentId: string; initialStatus: 'VALID' | 'REVOKED'; replacesId?: string | undefined })[];
};
export type Manifest = {
  seedId: string; projectRef: string; today: string;
  status: 'preparing' | 'complete' | 'failed';
  accounts: AuthAccount[]; population?: Population | undefined; orphanAuthIds?: string[] | undefined;
};
export interface SeedPorts {
  preflight(): Promise<void>;
  readManifest(): Promise<Manifest | null>;
  validateExisting(manifest: Manifest): Promise<void>;
  assertVacant(): Promise<void>;
  saveManifest(manifest: Manifest): Promise<void>;
  createAccount(account: DemoAccount): Promise<AuthAccount>;
  deleteAccount(authId: string): Promise<void>;
  /** Wait for the DB transaction lock and confirm none of these profiles committed. */
  confirmRollback(identities: AuthAccount[]): Promise<boolean>;
  /** Must commit atomically. A rejected commit can have an ambiguous network outcome. */
  populate(fixtures: DemoFixtures, identities: AuthAccount[]): Promise<Population>;
}
export async function runSeed(ports: SeedPorts, options: { apply?: boolean; today: string; projectRef?: string }) {
  await ports.preflight();
  const existing = await ports.readManifest();
  if (existing) {
    if (existing.status !== 'complete') throw new Error('Carga parcial: revisar el manifiesto y las cuentas registradas; no se reanuda ni borra automáticamente.');
    await ports.validateExisting(existing);
    return { status: 'existing' as const, manifest: existing };
  }
  await ports.assertVacant();
  const fixtures = buildFixtures(options.today);
  if (!options.apply) return { status: 'checked' as const, fixtures };
  const manifest: Manifest = { seedId, projectRef: options.projectRef ?? '', today: options.today, status: 'preparing', accounts: [] };
  await ports.saveManifest(manifest);
  let committed = false;
  let populationStarted = false;
  try {
    for (const account of accounts) {
      manifest.accounts.push(await ports.createAccount(account));
      await ports.saveManifest(manifest);
    }
    populationStarted = true;
    manifest.population = await ports.populate(fixtures, manifest.accounts);
    committed = true;
    manifest.status = 'complete';
    await ports.saveManifest(manifest);
    return { status: 'complete' as const, manifest };
  } catch (error) {
    if (committed) throw new Error('Carga PostgreSQL confirmada, pero falló el manifiesto final. No repetir ni eliminar cuentas: recuperar el manifiesto con los registros existentes.');
    if (populationStarted && !await ports.confirmRollback(manifest.accounts).catch(() => false)) {
      manifest.status = 'failed'; manifest.orphanAuthIds = manifest.accounts.map(a => a.authId);
      await ports.saveManifest(manifest).catch(() => undefined);
      throw new Error('No se pudo confirmar el rollback de PostgreSQL. Se conservaron las cuentas Auth; revisar el estado remoto y el manifiesto antes de reintentar.');
    }
    const orphans: string[] = [];
    for (const account of [...manifest.accounts].reverse()) {
      try { await ports.deleteAccount(account.authId); } catch { orphans.push(account.authId); }
    }
    manifest.status = 'failed'; manifest.orphanAuthIds = orphans;
    await ports.saveManifest(manifest).catch(() => undefined);
    const reason = error instanceof Error ? error.message : 'Fallo de carga.';
    throw new Error(`${reason} La transacción no se confirmó. Cuentas sin compensar: ${orphans.join(', ') || 'ninguna'}.`);
  }
}
