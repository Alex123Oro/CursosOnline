// Opt-in smoke check for a local database/API and its configured Supabase Auth.
// Creates one disposable account, verifies login and duplicates, then removes it.
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const base = new URL(process.env.INSTRUCTOR_TEST_API_URL ?? 'http://localhost:4312/api/');
const database = new URL(process.env.DATABASE_URL ?? '');
const local = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
if (!local(base.hostname) || !local(database.hostname)) throw new Error('This check requires a local API and database.');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('Supabase Auth configuration is required.');
const adminToken = process.env.INSTRUCTOR_TEST_ADMIN_TOKEN;
if (!adminToken) throw new Error('A real administrator access token is required in INSTRUCTOR_TEST_ADMIN_TOKEN.');
const prisma = new PrismaClient();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const email = `eva-instructor-test-${randomUUID()}@example.com`;
const password = `Aa9!${randomUUID()}`;
const sis = `0${String(randomInt(10000000, 100000000))}`;
let authId;
let accessToken;
let cleanupFailed = false;
const request = (path, options = {}) => fetch(new URL(path, base), { ...options, signal: AbortSignal.timeout(30000) });
try {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  if (!admin) throw new Error('A local administrator is required.');
  const payload = { name: 'Instructor de prueba temporal', email: email.toUpperCase(), degree: 'Ingeniero', sis,
    phone: '+591 (700) 123-45', password };
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify(payload) };
  const created = await request('admin/instructors', options);
  assert.equal(created.status, 201, 'Instructor creation must return 201.');
  const result = await created.json();
  if (JSON.stringify(result).includes(password) || 'password' in result || 'accessToken' in result) throw new Error('The response exposed credentials.');
  assert.equal(result.sis, sis); assert.equal(result.email, email); assert.equal(result.degree, 'Ingeniero'); assert.equal(result.role, 'INSTRUCTOR');
  const record = await prisma.user.findUnique({ where: { email }, select: { authId: true, sis: true, degree: true, phone: true } });
  assert.ok(record); authId = record.authId;
  assert.equal(record.sis, sis); assert.equal(record.degree, 'ENGINEER'); assert.equal(record.phone, payload.phone);
  const directory = await request('session/users', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(directory.status, 200);
  assert.ok((await directory.json()).some(user => user.email === email && user.sis === sis && user.degree === 'Ingeniero'));
  const login = await request('auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(login.status, 200, 'The newly created instructor must be able to log in.');
  const session = await login.json(); accessToken = session.accessToken;
  assert.equal(session.user.role, 'INSTRUCTOR');
  const me = await request('session/me', { headers: { Authorization: `Bearer ${accessToken}` } });
  assert.equal(me.status, 200);
  const forbidden = await request('admin/instructors', { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` } });
  assert.equal(forbidden.status, 403);
  const duplicate = await request('admin/instructors', options);
  assert.equal(duplicate.status, 409);
  const fields = (await duplicate.json()).fields;
  assert.ok(fields.some(field => field.path === 'sis')); assert.ok(fields.some(field => field.path === 'email'));
  console.log('PASS: real creation, SIS persistence, directory, Supabase login, instructor permission denial and duplicate rejection.');
} catch (error) {
  // Avoid logging response bodies, request payloads or secret-bearing SDK errors.
  console.error(error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'Instructor smoke check failed.');
  process.exitCode = 1;
} finally {
  try {
    if (accessToken) await request('auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: '{}' });
    const record = await prisma.user.findUnique({ where: { email }, select: { authId: true } });
    authId ??= record?.authId;
    // Recover an identity if a network interruption occurred before its profile was saved.
    if (!authId) {
      for (let page = 1; ; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
        if (error) throw new Error('Cleanup lookup failed.');
        authId = data.users.find(user => user.email?.toLowerCase() === email)?.id;
        if (authId || data.users.length < 100) break;
      }
    }
    if (authId) {
      const { error } = await supabase.auth.admin.deleteUser(authId);
      if (error) throw new Error('Cleanup failed.');
    }
    await prisma.user.deleteMany({ where: { email } });
    console.log('Cleanup complete: temporary test profile and Auth identity removed.');
  } catch {
    cleanupFailed = true;
    console.error('Temporary account cleanup requires attention. Locate the eva-instructor-test account created by this run.');
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
if (cleanupFailed) process.exitCode = 1;
