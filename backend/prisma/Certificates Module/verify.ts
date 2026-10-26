import assert from 'node:assert/strict';
import { AssertionError } from 'node:assert';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { createPorts, validateConfig, manifestUrl } from './adapter.js';
import { accounts, buildFixtures } from './fixtures.js';
import type { Certificate, CertificateRoster } from '../../src/modules/certificates/certificate.types.js';

// Optional post-load acceptance check. Never imported or run by seed.ts/tests.
// Reads application records; logins create temporary Auth sessions, closed in finally.
loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const db = new PrismaClient();
const sessions: string[] = [];
let api = '';
async function request(path: string, token?: string) {
  return fetch(`${api}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(20000) });
}
try {
  assert.equal(process.argv.length, 2, 'Este verificador no recibe argumentos.');
  const config = validateConfig(process.env);
  assert.ok(config.password && config.password.length >= 12, 'Falta CERTIFICATES_DEMO_PASSWORD.');
  api = `http://localhost:${Number(process.env.PUERTO ?? 3000)}/api`;
  const client = createClient(config.supabaseUrl, config.secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const ports = createPorts(db, client, config, fileURLToPath(manifestUrl(config.local, import.meta.url)));
  await ports.preflight();
  const manifest = await ports.readManifest();
  assert.ok(manifest?.status === 'complete' && manifest.population, 'Primero cargar la demo; no se crea información desde verify.ts.');
  await ports.validateExisting(manifest);
  const p = manifest.population; const fixtures = buildFixtures(manifest.today);
  const login = async (key: string) => {
    const account = accounts.find(a => a.key === key)!;
    const response = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: config.password }), signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200, `Login ${key}`);
    const session = await response.json() as { accessToken: string };
    assert.ok(session.accessToken, `Token ${key}`); sessions.push(session.accessToken); return session.accessToken;
  };
  const admin = await login('admin');
  const participant = await login('p07'); const empty = await login('p12');
  const instructor = await login('instructor');
  const roster = async (course: string, type: string) => {
    const id = p.courses.find(c => c.key === course)!.id;
    const response = await request(`/courses/${id}/certificates?type=${type}`, admin);
    assert.equal(response.status, 200, `Roster ${course}/${type}`); return await response.json() as CertificateRoster;
  };
  const approval = await roster('main', 'aprobacion');
  const participation = await roster('main', 'participacion');
  const student = (rows: CertificateRoster, key: string) => rows.students.find(s => s.enrollmentId === p.enrollments.find(e => e.key === `main-${key}`)!.id)!;
  assert.equal(approval.students.length, 10, 'Preinscripción excluida');
  for (const key of ['p01', 'p02', 'p03']) {
    assert.equal(student(approval, key).blockedReason, null, `${key} emisión pendiente`);
    assert.equal(student(approval, key).approvalStatus, 'APROBADO');
  }
  for (const key of ['p04', 'p05', 'p06']) assert.ok(student(approval, key).blockedReason, `${key} bloqueado aprobación`);
  for (const key of ['p04', 'p06']) assert.equal(student(participation, key).blockedReason, null, `${key} habilitado participación`);
  assert.ok(student(participation, 'p05').blockedReason, 'Asistencia insuficiente');
  for (const course of fixtures.courses.filter(c => c.key !== 'main')) {
    for (const type of ['aprobacion', 'participacion']) assert.ok((await roster(course.key, type)).students.every(s => s.blockedReason), `Bloqueo ${course.key}/${type}`);
  }
  const history = student(approval, 'p10') as typeof approval.students[number] & { certificateHistory?: unknown[] };
  // RPC history field is checked below directly from its existing JSON response.
  const serializedHistory = JSON.stringify(history);
  for (const cert of p.certificates.filter(c => c.key.startsWith('history-'))) assert.ok(serializedHistory.includes(cert.code), 'Historial conserva ambos códigos');
  for (const certificate of p.certificates) {
    const publicResponse = await request(`/certificates/verify/${certificate.code}`);
    assert.equal(publicResponse.status, 200, `Verificar ${certificate.key}`);
    assert.equal((await publicResponse.json() as { status: string }).status, certificate.initialStatus);
    const owner = p.enrollments.find(e => e.id === certificate.enrollmentId)!.participant;
    const token = owner === 'p07' ? participant : await login(owner);
    const detail = await request(`/certificates/me/${certificate.id}`, token);
    assert.equal(detail.status, 200, 'Detalle propietario');
    const dto = await detail.json() as Certificate;
    assert.equal(dto.code, certificate.code); assert.equal(dto.publicUrl, certificate.url);
    assert.equal((await request(`/certificates/me/${certificate.id}`, empty)).status, 404, 'Otro propietario no tiene acceso');
    const pdf = await request(`/certificates/me/${certificate.id}/pdf`, token);
    assert.equal(pdf.status, certificate.initialStatus === 'VALID' ? 200 : 409, `PDF ${certificate.key}`);
    if (pdf.status === 200) {
      assert.ok(pdf.headers.get('content-type')?.includes('application/pdf'));
      assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    }
  }
  const mine = await request('/certificates/me', empty);
  assert.equal(mine.status, 200); assert.deepEqual(await mine.json(), []);
  assert.equal((await request('/certificates/courses', participant)).status, 403);
  assert.equal((await request('/certificates/courses', instructor)).status, 403);
  assert.equal((await request('/certificates/courses')).status, 401);
  console.log('Estado inicial validado: candidatos, historial, estados, propietarios, verificación pública y PDF.');
} catch (error) {
  if (error instanceof AssertionError) console.error(error.message);
  console.error('Verificación incompleta: revisar backend, contraseña, manifiesto y estado inicial. Después de operar la demo, los casos pendientes o estados pueden haber cambiado. No se muestran tokens ni credenciales.');
  process.exitCode = 1;
} finally {
  for (const token of sessions) {
    await fetch(`${api}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }).catch(() => undefined);
  }
  await db.$disconnect();
}
