import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'dotenv';

const backend = fileURLToPath(new URL('../', import.meta.url));
const privateDir = join(backend, '.local/certificates-docker');
const active = join(backend, '.env');
const remote = join(privateDir, 'remote.env');
const local = join(privateDir, 'local.env');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
async function cli(args) {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(backend, 'node_modules/supabase/dist/supabase.js'), ...args], { cwd: backend, windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', async code => {
      await writeFile(join(privateDir, 'last-cli.log'), stdout + '\n' + stderr, { mode: 0o600 });
      if (code !== 0) reject(new Error('Supabase CLI falló. Revisar backend/.local/certificates-docker/last-cli.log.'));
      else resolve(stdout);
    });
  });
  return output;
}
function validateLocal(values) {
  const api = new URL(values.SUPABASE_URL); const database = new URL(values.DATABASE_URL);
  if (values.CERTIFICATES_DEMO_TARGET !== 'local' || api.origin !== 'http://127.0.0.1:54321' || database.hostname !== '127.0.0.1' || database.port !== '54322' || database.pathname !== '/postgres') throw new Error('Configuración local inválida; no se activó.');
}
async function baselineCheck() {
  const baseline = JSON.parse(await readFile(join(backend, 'supabase/baseline.json'), 'utf8'));
  for (const migration of baseline.migrations) {
    const sql = await readFile(join(backend, 'supabase', migration.file));
    if (createHash('sha256').update(sql).digest('hex') !== migration.sha256) throw new Error('El checksum del esquema inicial cambió. Revisar baseline.json antes de arrancar.');
  }
}
try {
  await mkdir(privateDir, { recursive: true });
  const action = process.argv[2];
  if (process.argv.length !== 3 || !['up', 'down', 'status', 'configure-local', 'use-local', 'use-remote'].includes(action)) throw new Error('Uso: node scripts/certificates-docker.mjs up|down|status|configure-local|use-local|use-remote');
  if (action === 'up') { await baselineCheck(); await cli(['start']); console.log('Supabase cursosonline-certificates iniciado.'); }
  if (action === 'down') { await cli(['stop', '--project-id', 'cursosonline-certificates']); console.log('Supabase local detenido; datos conservados.'); }
  if (action === 'status') {
    const status = JSON.parse(await cli(['status', '-o', 'json']));
    console.log(JSON.stringify({ api: status.API_URL, studio: status.STUDIO_URL, postgres: '127.0.0.1:54322', activeTarget: parse(await readFile(active)).CERTIFICATES_DEMO_TARGET ?? 'remote' }, null, 2));
  }
  if (action === 'configure-local') {
    const status = JSON.parse(await cli(['status', '-o', 'json']));
    if (new URL(status.API_URL).origin !== 'http://127.0.0.1:54321' || new URL(status.DB_URL).port !== '54322') throw new Error('El estado de Supabase no corresponde al proyecto local esperado.');
    if (!await exists(remote)) {
      const previous = parse(await readFile(active));
      if (previous.CERTIFICATES_DEMO_TARGET === 'local') throw new Error('La configuración activa ya es local y no existe copia remota. Revisar antes de continuar.');
      await copyFile(active, remote);
    }
    const previousLocal = await exists(local) ? parse(await readFile(local)) : {};
    const publishable = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
    const secret = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
    if (!publishable || !secret) throw new Error('Supabase no devolvió las claves locales.');
    const values = {
      NODE_ENV: 'development', CERTIFICATES_DEMO_TARGET: 'local',
      SUPABASE_URL: status.API_URL, SUPABASE_JWKS_URL: `${status.API_URL}/auth/v1/.well-known/jwks.json`,
      SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SECRET_KEY: secret,
      DATABASE_URL: status.DB_URL, DIRECT_URL: status.DB_URL,
      PUERTO: '3000', CORS_ORIGIN: 'http://localhost:4200', PUBLIC_APP_URL: 'http://localhost:4200',
      AUTH_EMAIL_REDIRECT_URL: 'http://localhost:4200/confirmar-correo', PDF_SIGNING_DEMO: 'false',
      CERTIFICATES_DEMO_PASSWORD: previousLocal.CERTIFICATES_DEMO_PASSWORD ?? randomBytes(24).toString('base64url')
    };
    validateLocal(values);
    await writeFile(local, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
    await copyFile(local, active);
    console.log('backend/.env conectado exclusivamente a Supabase local. Credenciales guardadas en .local/certificates-docker/local.env; reiniciar backend.');
  }
  if (action === 'use-local') { const values = parse(await readFile(local)); validateLocal(values); await copyFile(local, active); console.log('Configuración local activada; reiniciar backend.'); }
  if (action === 'use-remote') {
    const values = parse(await readFile(remote));
    if (values.CERTIFICATES_DEMO_TARGET === 'local' || !new URL(values.SUPABASE_URL).hostname.endsWith('.supabase.co')) throw new Error('La copia no corresponde a Supabase remoto.');
    await copyFile(remote, active); console.log('Configuración remota restaurada; reiniciar backend. No se ejecutaron seeds remotos.');
  }
} catch (error) {
  // Never print child output or environment values: both can contain credentials.
  console.error(error instanceof Error && error.constructor === Error && !('code' in error) ? error.message : 'Operación local incompleta; revisar archivos de configuración y logs privados.');
  process.exitCode = 1;
}
