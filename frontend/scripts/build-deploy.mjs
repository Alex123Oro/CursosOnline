import { spawnSync } from 'node:child_process';

const value = process.env.API_BASE_URL;
if (!value) throw new Error('Configura API_BASE_URL con la URL HTTPS pública del backend, incluyendo /api.');
const api = new URL(value);
if (api.protocol !== 'https:' || api.username || api.password || api.search || api.hash) {
  throw new Error('API_BASE_URL debe ser una URL HTTPS sin credenciales, parámetros ni fragmentos.');
}
const result = spawnSync(process.execPath, [
  'node_modules/@angular/cli/bin/ng.js', 'build', '--configuration=production',
  '--define', `API_BASE_URL=${JSON.stringify(value.replace(/\/$/, ''))}`
], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
