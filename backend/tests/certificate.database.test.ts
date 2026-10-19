import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const container = process.env.CERTIFICATE_TEST_CONTAINER ?? '';
const args = ['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'];
const run = (sql: string) => spawnSync('docker',args,{ input: sql, encoding: 'utf8', timeout: 20000 });
const query = (sql: string): string => {
  const result = run(sql);
  if (result.status !== 0) throw new Error(result.stderr || String(result.error));
  return result.stdout.trim();
};
const issue = (enrollment: number, code: string) => `SELECT public.emit_certificate(${enrollment},'${code}','https://example.test/verificar/${code}',1);`;
const concurrent = (sql: string) => new Promise<{ status: number | null; output: string }>((resolve,reject) => {
  const process = spawn('docker',args); let output = '';
  process.stdout.on('data',data => { output += data; }); process.stderr.on('data',data => { output += data; });
  process.on('error',reject); process.on('close',status => resolve({ status,output })); process.stdin.end(sql);
});

describe.skipIf(!container)('certificate SQL integration (isolated Docker only)', () => {
  beforeAll(() => {
    // Refuse to execute fixture DDL against any arbitrary container or remote DB.
    if (!container.startsWith('eva-certificates-test-')) throw new Error('Unsafe test container name');
    const label = spawnSync('docker',['inspect','--format','{{index .Config.Labels "eva.certificates.test"}}',container],{ encoding: 'utf8' });
    if (label.status !== 0 || label.stdout.trim() !== 'true') throw new Error('Missing isolated-test container label');
    query(readFileSync(new URL('./fixtures/certificates.sql',import.meta.url),'utf8'));
    query(readFileSync(new URL('../prisma/migrations/20261016010000_certificates/migration.sql',import.meta.url),'utf8'));
    query(readFileSync(new URL('../prisma/migrations/20261016020000_certificate_participation/migration.sql',import.meta.url),'utf8'));
    query('ALTER TABLE cursos ADD COLUMN instructor_id BIGINT REFERENCES usuarios(id); ALTER TABLE inscripciones ADD UNIQUE(id,curso_id); UPDATE cursos SET instructor_id=4 WHERE id=1;');
    query(readFileSync(new URL('../prisma/migrations/20261018100000_add_academic_management/migration.sql',import.meta.url),'utf8'));
  },30000);
  it('uses the same calculated outcome in the roster and issuance', () => {
    const roster = JSON.parse(query('SELECT certificate_candidates(1);'));
    expect(roster.students.find((row: { enrollmentId: string }) => row.enrollmentId==='10').approvalStatus).toBe('APROBADO');
    expect(roster.students.find((row: { enrollmentId: string }) => row.enrollmentId==='11').approvalStatus).toBe('PENDIENTE');
    expect(roster.students.some((row: { enrollmentId: string }) => row.enrollmentId==='17')).toBe(false);
    const certificate = JSON.parse(query(`SET ROLE service_role; ${issue(10,'8F72A91C')}`));
    expect(certificate.datos_emision).toEqual({ version: 1,participantName: 'Ana Álvarez',courseName: 'PostgreSQL',durationHours: 40 });
    expect(query('SELECT estado FROM resultados_curso WHERE inscripcion_id=10;')).toBe('aprobado');
  });
  it.each([11,12,13,14,17])('rejects enrollment %s for pending/failed requirements or preenrollment', enrollment => {
    expect(run(issue(enrollment,'ABCDEF01')).status).not.toBe(0);
    expect(query(`SELECT count(*) FROM resultados_curso WHERE inscripcion_id=${enrollment};`)).toBe('0');
  });
  it('does not modify an issued certificate or its result on duplicate emission', () => {
    expect(run(issue(10,'ABCDEF02')).status).not.toBe(0);
    expect(query('SELECT count(*) FROM certificados;')).toBe('1');
  });
  it('rolls back result creation on a code collision', () => {
    expect(run(issue(15,'8F72A91C')).status).not.toBe(0);
    expect(query('SELECT count(*) FROM resultados_curso WHERE inscripcion_id=15;')).toBe('0');
  });
  it('serializes two concurrent emissions for one enrollment', async () => {
    const results = await Promise.all([concurrent(issue(15,'ABCDEF03')),concurrent(issue(15,'ABCDEF04'))]);
    expect(results.filter(row => row.status===0)).toHaveLength(1);
    expect(query('SELECT count(*) FROM certificados c JOIN resultados_curso r ON r.id=c.resultado_curso_id WHERE r.inscripcion_id=15;')).toBe('1');
  });
  it('protects format, ownership FK, and direct RPC execution privileges', () => {
    expect(run(issue(16,'NOTHEX')).status).not.toBe(0);
    expect(run('INSERT INTO resultados_curso(inscripcion_id,nota_final,porcentaje_asistencia) VALUES(99999,80,100);').status).not.toBe(0);
    expect(run(`SET ROLE authenticated; ${issue(16,'ABCDEF05')}`).status).not.toBe(0);
    expect(run(`SET ROLE anon; ${issue(16,'ABCDEF05')}`).status).not.toBe(0);
    expect(run("SELECT emit_certificate(16,'ABCDEF05','https://example.test',4);").status).not.toBe(0);
  });
  it('retains issued contents after renaming course or participant', () => {
    query("UPDATE cursos SET nombre='Otro nombre' WHERE id=1; UPDATE usuarios SET nombre_completo='Otro nombre' WHERE id=2;");
    expect(query("SELECT datos_emision->>'participantName' FROM certificados WHERE codigo_verificacion='8F72A91C';")).toBe('Ana Álvarez');
    expect(query("SELECT datos_emision->>'courseName' FROM certificados WHERE codigo_verificacion='8F72A91C';")).toBe('PostgreSQL');
  });
  it('lists the certificate as annulled when the cancellation row exists', () => {
    query("INSERT INTO anulaciones_certificados(certificado_id,anulado_por,motivo) SELECT id,1,'Prueba' FROM certificados WHERE codigo_verificacion='8F72A91C';");
    const roster = JSON.parse(query('SELECT certificate_candidates(1);'));
    expect(roster.students.find((row: { enrollmentId: string }) => row.enrollmentId==='10').certificate.status).toBe('REVOKED');
  });
  it('allows participation with attendance and no grades, without fabricating a grade', () => {
    const roster = JSON.parse(query("SELECT certificate_candidates_for_type(1,'participacion');"));
    expect(roster.students.find((row: { enrollmentId: string }) => row.enrollmentId==='11').approvalStatus).toBe('APROBADO');
    const issued = JSON.parse(query("SELECT emit_certificate_for_type(11,'1234ABCD','https://example.test/verificar/1234ABCD',1,'participacion');"));
    expect(issued.tipo).toBe('participacion');
    expect(query('SELECT nota_final IS NULL AND NOT cumple_nota AND cumple_asistencia FROM resultados_curso WHERE inscripcion_id=11;')).toBe('t');
    expect(run("SELECT emit_certificate_for_type(11,'1234ABCE','https://example.test/verificar/1234ABCE',1,'participacion');").status).not.toBe(0);
  });
  it('allows attendance certificates with low grades but rejects insufficient attendance or unfinished courses', () => {
    expect(run("SELECT emit_certificate_for_type(12,'1234ABCF','https://example.test/verificar/1234ABCF',1,'participacion');").status).toBe(0);
    expect(query('SELECT estado FROM resultados_curso WHERE inscripcion_id=12;')).toBe('reprobado');
    for (const id of [13,14,17]) expect(run(`SELECT emit_certificate_for_type(${id},'1234ABDD','https://example.test/verificar/1234ABDD',1,'participacion');`).status).not.toBe(0);
    expect(run("SET ROLE authenticated; SELECT certificate_candidates_for_type(1,'participacion');").status).not.toBe(0);
  });
  it('reapplies academic migration without replacing certificate results or duplicating assignments', () => {
    const before = query('SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM resultados_curso r;');
    const certificates = query('SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM certificados c;');
    query(readFileSync(new URL('../prisma/migrations/20261018100000_add_academic_management/migration.sql',import.meta.url),'utf8'));
    expect(query('SELECT count(*) FROM asignaciones_instructores WHERE curso_id=1 AND instructor_id=4;')).toBe('1');
    query("INSERT INTO resultados_academicos_curso(curso_id,inscripcion_id,nota_final,porcentaje_asistencia,estado) VALUES(1,10,90,100,'aprobado'); UPDATE resultados_academicos_curso SET estado='pendiente',nota_final=NULL,porcentaje_asistencia=NULL;");
    expect(query('SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM resultados_curso r;')).toBe(before);
    expect(query('SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM certificados c;')).toBe(certificates);
    expect(run('INSERT INTO resultados_academicos_curso(curso_id,inscripcion_id) VALUES(2,11);').status).not.toBe(0);
  });
});
