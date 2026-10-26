import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPorts, validateConfig, manifestUrl } from './adapter.js';
import { laPazToday } from './fixtures.js';
import { runSeed } from './runner.js';

// This is the only executable entry point. Tests import fixtures/runner/adapter only.
loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const args = process.argv.slice(2);
let db: PrismaClient | undefined;
let lock: Awaited<ReturnType<typeof open>> | undefined;
const manifestPath = fileURLToPath(manifestUrl(process.env.CERTIFICATES_DEMO_TARGET === 'local', import.meta.url));
const lockPath = `${manifestPath}.lock`;
try {
  if (args.some(arg => arg !== '--apply') || args.length > 1) throw new Error('Uso: tsx "prisma/Certificates Module/seed.ts" [--apply]');
  const apply = args.includes('--apply');
  const config = validateConfig(process.env);
  // Validate locally before writing the journal or creating any identities.
  if (apply && (!config.password || config.password.length < 12)) throw new Error('Configurar CERTIFICATES_DEMO_PASSWORD con al menos 12 caracteres.');
  if (apply) {
    await mkdir(dirname(manifestPath), { recursive: true });
    try { lock = await open(lockPath, 'wx', 0o600); }
    catch { throw new Error('Existe un bloqueo de carga o no se puede crear. Comprobar que no haya otra ejecución antes de retirar manifest.json.lock.'); }
  }
  db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });
  const auth = createClient(config.supabaseUrl, config.secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) }) }
  });
  const result = await runSeed(createPorts(db, auth, config, manifestPath), { apply, today: laPazToday(), projectRef: config.projectRef });
  console.log(JSON.stringify({ status: result.status, project: config.projectRef,
    message: result.status === 'checked' ? 'Comprobación sin escrituras remotas. Carga NO ejecutada.' : result.status === 'existing' ? 'Demo existente validada; no se restauraron ni modificaron registros.' : 'Demo creada. Consultar el manifiesto local para IDs y códigos.',
    manifestPath }, null, 2));
} catch (error) {
  // Prisma/network errors can include connection strings: print only controlled messages.
  const message = error instanceof Error && error.constructor === Error ? error.message : 'Falló la comprobación o la transacción. Revisar configuración, conectividad y esquema; no se muestran detalles de credenciales.';
  const secrets = [process.env.DATABASE_URL, process.env.DIRECT_URL, process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_PUBLISHABLE_KEY, process.env.CERTIFICATES_DEMO_PASSWORD].filter((s): s is string => Boolean(s));
  let safe = message;
  for (const secret of secrets) safe = safe.replaceAll(secret, '[REDACTADO]');
  safe = safe.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[CONEXIÓN REDACTADA]');
  console.error(safe); process.exitCode = 1;
} finally {
  await db?.$disconnect();
  if (lock) { await lock.close(); await unlink(lockPath); }
}
