import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
const local = new URL('../.local/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('full-workflow-dataset.json', local), 'utf8'));
const credential = JSON.parse(await readFile(new URL('admin-initial-credentials.json', local), 'utf8'));
const reportUrl = new URL('full-workflow-bulk-verification.json', local);
try {
  const prior = JSON.parse(await readFile(reportUrl, 'utf8'));
  if (prior.passed) {
    console.log(JSON.stringify({ alreadyVerified: true, requests: prior.requests }));
    process.exit(0);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const base = `http://localhost:${process.env.PUERTO ?? 3000}/api`;
let token;
let requests = 0;
const results = [];
async function request(method, path, body) {
  const response = await fetch(`${base}/${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  requests++;
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
try {
  const auth = await request('POST', 'auth/login', {
    email: credential.email,
    password: credential.password,
  });
  token = auth.accessToken;
  for (const [key, type] of [
    ['APROBADOS', 'aprobacion'],
    ['PARTICIPACION', 'participacion'],
  ]) {
    const course = manifest.scenarios.find((item) => item.key === key);
    const roster = await request('GET', `courses/${course.id}/certificates?type=${type}`);
    const ids = roster.students
      .filter((row) => row.approvalStatus === 'APROBADO' && !row.certificate && !row.blockedReason)
      .slice(0, 2)
      .map((row) => row.enrollmentId);
    if (ids.length !== 2) throw new Error('Need two untouched eligible candidates for the bulk exercise.');
    const issued = await request('POST', `courses/${course.id}/certificates/bulk`, {
      enrollmentIds: ids,
      type,
    });
    if (
      issued.issued.length !== 2 ||
      issued.failed.length ||
      issued.issued.some((item) => item.type !== type)
    )
      throw new Error('Bulk type/result mismatch.');
    const repeated = await request('POST', `courses/${course.id}/certificates/bulk`, {
      enrollmentIds: ids,
      type,
    });
    if (repeated.issued.length || repeated.failed.length !== 2)
      throw new Error('Bulk retry created duplicate certificates.');
    for (const certificate of issued.issued) {
      const verified = await request('GET', `certificates/verify/${certificate.code}`);
      if (verified.status !== 'VALID' || verified.type !== type)
        throw new Error('Bulk certificate verification mismatch.');
    }
    results.push({
      courseId: course.id,
      type,
      enrollmentIds: ids,
      certificates: issued.issued.map((item) => ({ id: item.id, code: item.code })),
      duplicatesBlocked: true,
    });
  }
  const report = { passed: true, verifiedAt: new Date().toISOString(), requests, results };
  await writeFile(reportUrl, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  console.error('Bulk workflow verification failed:', error.message);
  process.exitCode = 1;
} finally {
  if (token)
    try {
      await fetch(`${base}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
    } catch {}
}
