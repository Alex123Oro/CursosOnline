import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
const local = new URL('../.local/', import.meta.url);
const restored = JSON.parse(await readFile(new URL('restored-test-credentials.json', local), 'utf8'));
const added = JSON.parse(await readFile(new URL('full-workflow-credentials.json', local), 'utf8'));
const exercise = JSON.parse(await readFile(new URL('full-workflow-exercise.json', local), 'utf8'));
const base = `http://localhost:${process.env.PUERTO ?? 3000}/api`;
const tokens = [];
async function get(path, token) {
  const response = await fetch(`${base}/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
  return response;
}
async function login(account) {
  const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  const session = await response.json(); tokens.push(session.accessToken); return session.accessToken;
}
const dirty = value => /\[(PRUEBA|DEMO)|DEMOSTRACION SIN VALIDEZ ACADEMICA|Participante de prueba|EVA-(PRUEBA|FLUJO)-|sint[eé]tic|^PRUEBA:/i.test(value ?? '');
try {
  const admin = await login(restored.users.find(user => user.email === 'admin@eva.local'));
  const courses = await (await get('courses', admin)).json();
  const users = await (await get('session/users', admin)).json();
  if (courses.some(course => [course.name, course.code, course.instructor, course.content].some(dirty)) || users.some(user => dirty(user.name))) throw new Error('A visible course field or user name still contains a label.');
  const owner = await login(added.users.find(user => user.email === 'alumno20.flujo@eva.local'));
  const certificates = await (await get('certificates/me', owner)).json();
  const certificate = certificates.find(item => item.code === exercise.certificateCode);
  if (!certificate?.demo || dirty(certificate.courseName) || dirty(certificate.participantName)) throw new Error('Certificate provenance or display name failed.');
  const bytes = Buffer.from(await (await get(`certificates/me/${certificate.id}/pdf`, owner)).arrayBuffer());
  const pdf = await PDFDocument.load(bytes);
  if (!pdf.getSubject()?.includes('sin validez académica')) throw new Error('Demonstration provenance was lost from the PDF.');
  await writeFile(new URL('../../docs/output/recorrido-integral-certificado.pdf', import.meta.url), bytes);
  console.log(JSON.stringify({ courses: courses.length, users: users.length, remainingVisibleLabels: 0, cleanCertificate: certificate.code, pdfVerified: true }));
} catch (error) { console.error('Display verification failed:', error.message); process.exitCode = 1; }
finally { for (const token of tokens) try { await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }); } catch {} }
