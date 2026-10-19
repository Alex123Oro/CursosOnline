import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) }
});
const report = { generatedAt: new Date().toISOString(), tables: {}, authDemoUsers: [], errors: [] };
for (const table of ['usuarios', 'cursos', 'inscripciones', 'sesiones', 'asistencias_participantes', 'asistencias_instructores', 'evaluaciones', 'calificaciones', 'resultados_curso', 'certificados', 'anulaciones_certificados', 'preinscripciones', 'becas', 'precios_curso', 'pagos', 'usuarios_roles']) {
  const { data, error, count } = await db.from(table).select('*', { count: 'exact' }).limit(1000);
  if (error) { report.errors.push({ table, message: error.message }); continue; }
  // Written only to a local ignored report; no credentials or tokens are included.
  report.tables[table] = { count, rows: data };
}
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
  if (error) { report.errors.push({ source: 'auth', message: error.message }); break; }
  report.authDemoUsers.push(...data.users.filter(user => /@eva\.local$|^eva-instructor-test-.*@example\.com$/.test(user.email ?? '')).map(user => ({ id: user.id, email: user.email })));
  if (data.users.length < 100) break;
}
await writeFile(process.argv.includes('--after') ? '.local/real-environment-after.json' : '.local/real-environment-audit.json', JSON.stringify(report, null, 2));
for (const [table, info] of Object.entries(report.tables)) {
  console.log(JSON.stringify({ table, count: info.count, candidates: info.rows.filter(row => /@eva\.local|DEMO|DEMOSTRACION|Prueba HU-/i.test(JSON.stringify(row))).map(row => ({ id: row.id, code: row.codigo, name: row.nombre, email: row.correo })) }));
}
console.log(JSON.stringify({ authDemoUsers: report.authDemoUsers, errors: report.errors }));
// Print only connection hosts, never usernames, passwords, or keys.
for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  if (!process.env[key]) continue;
  const url = new URL(process.env[key]);
  console.log(JSON.stringify({ setting: key, host: url.hostname, port: url.port }));
}
