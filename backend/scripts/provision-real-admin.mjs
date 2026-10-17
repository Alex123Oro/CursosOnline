import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const email = 'maykel.zalazar@gmail.com';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) }
});
let identity;
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw new Error(`Auth lookup failed: ${error.code ?? error.status}`);
  identity = data.users.find(user => user.email?.toLowerCase() === email);
  if (identity || data.users.length < 100) break;
}
const { data: profiles, error } = await db.from('usuarios').select('id,auth_id,correo,nombre_completo,rol,activo').ilike('correo', email);
if (error) throw new Error(`Profile lookup failed: ${error.code}`);
console.log(JSON.stringify({ email, identityExists: Boolean(identity), confirmed: Boolean(identity?.email_confirmed_at), profiles }));
if (!process.argv.includes('--apply')) process.exit(0);
if (profiles.length > 1 || (identity && profiles.some(profile => profile.auth_id !== identity.id))) throw new Error('Ambiguous identity; review required.');
let password;
let created = false;
const credentialsPath = new URL('../.local/admin-initial-credentials.json', import.meta.url);
if (!identity) {
  if (profiles.length) throw new Error('Existing unlinked profile; manual reconciliation required.');
  password = `EVA!${randomBytes(24).toString('base64url')}a9`;
  await mkdir(new URL('../.local/', import.meta.url), { recursive: true });
  // Save before creating the identity so an interruption never loses its password.
  await writeFile(credentialsPath, JSON.stringify({ email, password, loginUrl: `${(process.env.PUBLIC_APP_URL ?? 'http://localhost:4200').replace(/\/$/, '')}/iniciar-sesion`, createdAt: new Date().toISOString() }, null, 2), { flag: 'wx', mode: 0o600 });
  const result = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Administración EVA' } });
  if (result.error || !result.data.user) throw new Error(`Account creation failed: ${result.error?.code ?? result.error?.status}`);
  identity = result.data.user;
  created = true;
}
const { data: admin, error: saveError } = await db.from('usuarios').upsert({
  auth_id: identity.id, correo: email, nombre_completo: 'Administración EVA', nombre: 'Administración EVA',
  rol: 'administrador', activo: true, tipo_participante_id: null
}, { onConflict: 'auth_id' }).select('id,auth_id,correo,rol,activo').single();
if (saveError || !admin || admin.rol !== 'administrador' || !admin.activo) throw new Error(`Administrator profile failed: ${saveError?.code}`);
if (!password) {
  try {
    const local = JSON.parse(await readFile(credentialsPath, 'utf8'));
    if (local.email === email) password = local.password;
  } catch { /* Existing accounts retain their password. */ }
}
let apiVerified = false;
if (password) {
  const base = `http://localhost:${process.env.PUERTO ?? 3000}/api`;
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(30000) });
  if (!login.ok) throw new Error(`Real API login failed: ${login.status}`);
  const session = await login.json();
  if (session.user.email !== email || session.user.role !== 'ADMIN') throw new Error('Unexpected authenticated account.');
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  for (const route of ['session/me', 'certificates/courses']) {
    const response = await fetch(`${base}/${route}`, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Administrator API check failed: ${route} ${response.status}`);
  }
  await fetch(`${base}/auth/logout`, { method: 'POST', headers, signal: AbortSignal.timeout(20000) });
  apiVerified = true;
}
const report = { email, created, profileId: String(admin.id), authId: identity.id, role: admin.rol, apiVerified, verifiedAt: new Date().toISOString(), credentialsFile: created ? '.local/admin-initial-credentials.json' : undefined };
await writeFile(new URL('../.local/admin-provisioning-result.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
