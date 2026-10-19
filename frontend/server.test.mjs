import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFrontendServer } from './server.mjs';

let root, server, base;
before(async () => {
  const temporary = process.platform === 'win32' ? join(process.env.LOCALAPPDATA, 'Temp', 'opencode') : tmpdir();
  root = await mkdtemp(join(temporary, 'eva-frontend-test-'));
  await writeFile(join(root, 'index.html'), '<h1>EVA frontend</h1>');
  await writeFile(join(root, 'main-ABC123.js'), 'console.log("frontend");');
  await writeFile(join(root, '.env'), 'must-not-be-public');
  await mkdir(join(root, 'pdfjs'));
  await writeFile(join(root, 'pdfjs', 'pdf.worker.min.mjs'), 'export {};');
  server = createFrontendServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  if (root) await rm(root, { recursive: true }); // Only this test's generated directory.
});

test('serves the compiled index and disables HTML caching', async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.match(await response.text(), /EVA frontend/);
});
test('serves deep Angular routes as HTML without redirecting', async () => {
  const response = await fetch(`${base}/verificar/8F72A91C`, { headers: { Accept: 'text/html' } });
  assert.equal(response.status, 200); assert.match(await response.text(), /EVA frontend/);
});
test('serves immutable hashed JS and PDF worker modules with correct MIME', async () => {
  const response = await fetch(`${base}/main-ABC123.js`);
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /immutable/);
  const worker = await fetch(`${base}/pdfjs/pdf.worker.min.mjs`);
  assert.equal(worker.status, 200); assert.match(worker.headers.get('content-type'), /javascript/);
});
test('supports HEAD without sending a body', async () => {
  const response = await fetch(base, { method: 'HEAD' });
  assert.equal(response.status, 200); assert.ok(Number(response.headers.get('content-length')) > 0);
  assert.equal(await response.text(), '');
});
test('does not replace missing assets, API paths or dotfiles with HTML', async () => {
  for (const path of ['/missing.js', '/api/health', '/.env', '/.git/config', '/missing-data']) {
    const response = await fetch(`${base}${path}`, { headers: { Accept: path === '/missing-data' ? 'application/json' : 'text/html' } });
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(await response.text(), /EVA frontend|must-not-be-public/);
  }
});
test('rejects malformed paths and backslash traversal', async () => {
  for (const path of ['/%ZZ', '/%5C..%5C.env']) assert.equal((await fetch(`${base}${path}`)).status, 400);
});
test('rejects write methods', async () => {
  const response = await fetch(base, { method: 'POST' });
  assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'GET, HEAD');
});
