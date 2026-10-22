import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Browser-only demonstration fixtures. No real accounts or database writes.
let playwright;
try { playwright = await import('playwright'); }
catch {
  const links = join(process.env.LOCALAPPDATA, 'ms-playwright', '.links');
  for (const entry of await readdir(links)) {
    const location = (await readFile(join(links, entry), 'utf8')).trim();
    try { playwright = await import(pathToFileURL(join(location, 'index.mjs')).href); break; } catch {}
  }
}
if (!playwright) throw new Error('An installed Playwright package is required.');
const output = new URL('../../docs/output/campus-participante/', import.meta.url);
await mkdir(output, { recursive: true });
const user = { id: 'campus-demo', name: 'Ana Álvarez', email: 'campus@example.test', role: 'PARTICIPANT', participantTypeId: null, participantTypeName: null };
const record = {
  enrollmentId: 'demo-1', enrollmentStatus: 'INSCRITO',
  course: { id: 'demo-1', code: 'EVA-WEB-01', name: 'Desarrollo web con JavaScript', startDate: '2026-10-01', endDate: '2026-11-30' },
  attendance: { presentSessions: 3, completedSessions: 4, percentage: 75, sessions: [
    { sessionId: '1', sessionNumber: 1, date: '2026-10-02', startTime: '18:30', durationMinutes: 90, status: 'PRESENT' },
    { sessionId: '2', sessionNumber: 2, date: '2026-10-09', startTime: '18:30', durationMinutes: 90, status: 'ABSENT' },
    { sessionId: '3', sessionNumber: 3, date: '2026-10-16', startTime: '18:30', durationMinutes: 90, status: 'PRESENT' },
    { sessionId: '4', sessionNumber: 4, date: '2026-10-20', startTime: '18:30', durationMinutes: 90, status: 'PRESENT' }
  ] },
  evaluations: [
    { id: '1', title: 'Proyecto: mi primera aplicación', score: 85, maxScore: 100, weight: 50, comment: 'Buen manejo de los conceptos.', gradedAt: '2026-10-15T15:00:00Z', percentage: 85 },
    { id: '2', title: 'Proyecto final', score: null, maxScore: 100, weight: 50, comment: null, gradedAt: null, percentage: null }
  ],
  currentGrade: 85, finalGrade: null, minimumPassingScore: 70,
  requirements: { academicMet: null, attendanceMet: null, minimumAttendancePercent: 80 }, finalStatus: null, certificateEligible: false
};
const records = [record, {
  ...record, enrollmentId: 'demo-2', enrollmentStatus: 'PREINSCRITO',
  course: { id: 'demo-2', code: 'EVA-DAT-02', name: 'Análisis de datos con Excel', startDate: '2026-11-05', endDate: '2026-12-18' },
  attendance: { presentSessions: 0, completedSessions: 0, percentage: null, sessions: [] }, evaluations: [], currentGrade: null
}, {
  ...record, enrollmentId: 'demo-3', course: { id: 'demo-3', code: 'EVA-SQL-03', name: 'Fundamentos de bases de datos', startDate: '2026-08-01', endDate: '2026-09-30' },
  attendance: { ...record.attendance, presentSessions: 4, percentage: 100, sessions: record.attendance.sessions.map(session => ({ ...session, status: 'PRESENT' })) },
  evaluations: [{ ...record.evaluations[0], score: 92, percentage: 92, weight: 100 }], currentGrade: 92, finalGrade: 92,
  requirements: { academicMet: true, attendanceMet: true, minimumAttendancePercent: 80 }, finalStatus: 'APROBADO', certificateEligible: true
}];
const certificate = { id: 'demo-3', code: 'DEMO-SQL-2026', participantName: user.name, courseName: 'Fundamentos de bases de datos', durationHours: 40, type: 'aprobacion', issuedAt: '2026-10-01T12:00:00Z', status: 'VALID', publicUrl: 'https://example.test/verificar/DEMO-SQL-2026' };
let mode = 'populated';
const errors = [], requests = [], checks = [];
const browser = await playwright.chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await context.addInitScript(user => {
    localStorage.setItem('eva-access-token', 'browser-fixture-only');
    localStorage.setItem('eva-user', JSON.stringify(user));
    localStorage.setItem('eva-user-id', user.id);
  }, user);
  await context.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ method: request.method(), path });
    if (request.method() !== 'GET') throw new Error(`Unexpected write: ${request.method()} ${path}`);
    let body;
    if (path.endsWith('/session/me')) body = user;
    else if (path.endsWith('/progress/me')) {
      if (mode === 'error') return route.fulfill({ status: 503, json: { message: 'No se pudo cargar tu progreso.' } });
      body = mode === 'empty' ? [] : records;
    }
    else if (path.endsWith('/certificates/me')) body = mode === 'empty' ? [] : [certificate, { ...certificate, id: 'demo-4', courseName: 'Introducción a redes', code: 'DEMO-RED-2026', status: 'REVOKED', type: 'participacion' }];
    else if (path.endsWith('/certificates/me/demo-3')) body = certificate;
    else if (path.endsWith('/courses/catalog')) body = [];
    else throw new Error(`Unexpected API request: ${path}`);
    return route.fulfill({ json: body });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const base = process.env.CAMPUS_REVIEW_URL ?? 'http://127.0.0.1:4300';
  async function noOverflow(label) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${label}: horizontal overflow`);
    checks.push(label);
  }
  await page.goto(`${base}/mis-cursos`);
  await page.locator('.progress-item').first().waitFor();
  await page.locator('.welcome-image').evaluate(image => image.decode());
  assert.equal(await page.locator('.welcome-image').evaluate(image => image.naturalWidth), 2000);
  checks.push('supplied campus banner loads at original resolution');
  assert.deepEqual(await page.locator('.summary-card strong').allTextContents(), ['3', '2', '1', '1']);
  await noOverflow('desktop courses');
  await page.screenshot({ path: fileURLToPath(new URL('mis-cursos-escritorio.png', output)), fullPage: true });
  await page.getByRole('link', { name: 'Asistencia', exact: true }).click();
  await page.locator('.session-history[open]').first().waitFor();
  assert.equal(await page.getByText('Ausente', { exact: true }).count(), 1);
  await noOverflow('desktop attendance');
  await page.screenshot({ path: fileURLToPath(new URL('asistencia-escritorio.png', output)), fullPage: true });
  await page.getByRole('link', { name: 'Calificaciones', exact: true }).click();
  await page.getByText('Ponderación: 50%').first().waitFor();
  checks.push('grade view retains grades and weights');
  await page.getByRole('link', { name: 'Resultados', exact: true }).click();
  await page.getByText('Nota final', { exact: false }).first().waitFor();
  checks.push('results view retains requirements');
  await page.goto(`${base}/mis-certificados`);
  await page.locator('.certificate-list li').first().waitFor();
  assert.equal((await page.locator('.achievement-total strong').textContent()).trim(), '1');
  assert.equal(await page.getByRole('button', { name: 'Descargar PDF', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Compartir', exact: true }).click();
  await page.getByLabel('Enlace público de verificación').waitFor();
  await page.getByRole('button', { name: 'Compartir', exact: true }).click();
  await noOverflow('desktop certificates and share');
  await page.screenshot({ path: fileURLToPath(new URL('certificados-escritorio.png', output)), fullPage: true });
  await page.getByRole('link', { name: 'Ver detalle', exact: false }).first().click();
  await page.getByText('DEMO-SQL-2026', { exact: true }).waitFor();
  checks.push('certificate detail navigation');
  await page.goto(`${base}/catalogo`);
  await page.getByRole('link', { name: 'Mi campus', exact: true }).click();
  await page.locator('.progress-item').first().waitFor();
  checks.push('catalogue returns to participant campus');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/mis-cursos`);
  await page.locator('.progress-item').first().waitFor();
  await noOverflow('mobile courses');
  assert.equal(await page.locator('.welcome-image').evaluate(image => image.complete && image.naturalWidth === 2000), true);
  await page.screenshot({ path: fileURLToPath(new URL('mis-cursos-movil.png', output)), fullPage: true });
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.locator('.sidebar.open').waitFor();
  await page.screenshot({ path: fileURLToPath(new URL('menu-movil.png', output)) });
  await page.locator('.sidebar').getByRole('link', { name: 'Mis certificados', exact: true }).click();
  await page.locator('.certificate-list li').first().waitFor();
  assert.equal(await page.locator('.sidebar.open').count(), 0);
  await noOverflow('mobile menu navigation and certificates');
  await page.screenshot({ path: fileURLToPath(new URL('certificados-movil.png', output)), fullPage: true });
  mode = 'empty';
  await page.goto(`${base}/mis-cursos`);
  await page.getByText('Tu siguiente aprendizaje te espera', { exact: true }).waitFor();
  await noOverflow('mobile empty courses');
  await page.goto(`${base}/mis-certificados`);
  await page.getByText('Aún no tienes certificados', { exact: true }).waitFor();
  await noOverflow('mobile empty certificates');
  mode = 'error';
  await page.goto(`${base}/mi-progreso`);
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('.summary-grid').count(), 0);
  mode = 'populated';
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await page.locator('.progress-item').first().waitFor();
  checks.push('error and retry restore populated view');
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(`overview at ${width}px`);
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
  await writeFile(new URL('verificacion.json', output), JSON.stringify({ fixtureOnly: true, databaseWrites: 0, checks, browserErrors: errors, interceptedRequests: requests.length }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, screenshots: 6, browserErrors: errors.length, fixtureOnly: true }));
} finally { await browser.close(); }
