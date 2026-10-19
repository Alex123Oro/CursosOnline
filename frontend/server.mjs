import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf'
};

// This service only delivers Angular. Express and privileged credentials remain
// in the existing backend service; API_BASE_URL is injected at build time.
export const createFrontendServer = (root = resolve(directory, 'dist/frontend/browser')) => createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const reject = (status, text) => {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : text);
  };
  if (!['GET', 'HEAD'].includes(request.method ?? '')) {
    response.setHeader('Allow', 'GET, HEAD'); reject(405, 'Method not allowed'); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname); }
  catch { reject(400, 'Invalid path'); return; }
  if (pathname.includes('\\') || pathname.includes('\0')) { reject(400, 'Invalid path'); return; }
  // Never serve a deployment secret, repository metadata or an API as HTML.
  if (pathname.split('/').some(part => part.startsWith('.')) || /^\/api(?:\/|$)/.test(pathname)) {
    reject(404, 'Not found'); return;
  }
  const absoluteRoot = resolve(root);
  let file = resolve(absoluteRoot, `.${pathname}`);
  if (file !== absoluteRoot && !file.startsWith(`${absoluteRoot}${sep}`)) { reject(403, 'Forbidden'); return; }
  try {
    let metadata;
    try {
      metadata = await stat(file);
      if (metadata.isDirectory()) { file = resolve(file, 'index.html'); metadata = await stat(file); }
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
      if (extname(pathname) || !request.headers.accept?.includes('text/html')) { reject(404, 'Not found'); return; }
      file = resolve(absoluteRoot, 'index.html'); metadata = await stat(file);
    }
    if (!metadata.isFile()) { reject(404, 'Not found'); return; }
    const immutable = /\/(?:main|chunk|styles)-[\w-]+\.(?:m?js|css)$/i.test(pathname);
    response.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': metadata.size,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
    if (request.method === 'HEAD') { response.end(); return; }
    pipeline(createReadStream(file), response, () => {});
  } catch {
    if (!response.headersSent) reject(503, 'Frontend unavailable');
    else response.destroy();
  }
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 10000);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  // Refuse an apparently healthy deployment with no compiled frontend.
  await stat(resolve(directory, 'dist/frontend/browser/index.html'));
  createFrontendServer().listen(port, '0.0.0.0', () => console.log(`Angular frontend listening on port ${port}`));
}
