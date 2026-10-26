import { randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { accounts, buildFixtures, seedId, type DemoFixtures } from './fixtures.js';
import type { AuthAccount, Manifest, Population, SeedPorts } from './runner.js';

export function validateConfig(source: Record<string, string | undefined>) {
  for (const key of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'DATABASE_URL', 'PUBLIC_APP_URL']) {
    if (!source[key]?.trim()) throw new Error(`Falta ${key}. Configurar backend/.env.`);
  }
  let url: URL; let publicUrl: URL;
  try { url = new URL(source.SUPABASE_URL!); publicUrl = new URL(source.PUBLIC_APP_URL!); }
  catch { throw new Error('SUPABASE_URL o PUBLIC_APP_URL inválida.'); }
  const target = source.CERTIFICATES_DEMO_TARGET || 'remote';
  if (!['remote', 'local'].includes(target)) throw new Error('CERTIFICATES_DEMO_TARGET debe ser local o remote.');
  const local = target === 'local';
  const loopback = (host: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(host);
  const projectRef = local ? 'local-cursosonline-certificates' : /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname)?.[1];
  const endpointMatches = local ? loopback(url.hostname) && url.protocol === 'http:' && url.port === '54321' : Boolean(projectRef) && url.protocol === 'https:' && !url.port;
  if (!endpointMatches || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('SUPABASE_URL no corresponde al entorno seleccionado. Local requiere loopback:54321; remoto requiere el origen HTTPS del proyecto.');
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    if (!source[key]) continue;
    let dbUrl: URL;
    try { dbUrl = new URL(source[key]!); } catch { throw new Error(`${key} inválida.`); }
    const direct = dbUrl.hostname === `db.${projectRef}.supabase.co`;
    const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(dbUrl.hostname) && decodeURIComponent(dbUrl.username).endsWith(`.${projectRef}`);
    const databaseMatches = local ? loopback(dbUrl.hostname) && dbUrl.port === '54322' && decodeURIComponent(dbUrl.username) === 'postgres' : direct || pooler;
    if (!['postgres:', 'postgresql:'].includes(dbUrl.protocol) || !databaseMatches || !dbUrl.password) throw new Error(`${key} no corresponde al proyecto de SUPABASE_URL o no contiene contraseña.`);
    // The RPCs and raw SQL use public in the project's postgres database.
    // Reject all conflicting duplicate schema parameters as well.
    if (dbUrl.pathname !== '/postgres' || dbUrl.searchParams.getAll('schema').some(schema => schema !== 'public')) throw new Error(`${key} debe usar la base postgres y el esquema public del proyecto.`);
  }
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash || (source.NODE_ENV === 'production' && publicUrl.protocol !== 'https:')) throw new Error('PUBLIC_APP_URL debe ser un origen HTTP(S) sin ruta; producción requiere HTTPS.');
  if (source.PDF_SIGNING_P12_PATH || source.PDF_SIGNING_DEMO === 'true') throw new Error('Esta demo requiere PDF sin firma criptográfica: quitar PDF_SIGNING_P12_PATH y PDF_SIGNING_DEMO.');
  return { projectRef: projectRef!, local, publicUrl: publicUrl.origin, supabaseUrl: url.origin, secret: source.SUPABASE_SECRET_KEY!, publishable: source.SUPABASE_PUBLISHABLE_KEY!, password: source.CERTIFICATES_DEMO_PASSWORD };
}
export type DemoConfig = ReturnType<typeof validateConfig>;
export const manifestUrl = (local: boolean, moduleUrl: string) => new URL(local ? '../../.local/certificates-module-local/manifest.json' : '../../.local/certificates-module/manifest.json', moduleUrl);

export async function populateDatabase(db: PrismaClient, fixtures: DemoFixtures, identities: AuthAccount[], publicUrl: string): Promise<Population> {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(31002610)`;
    // Recheck within the transaction, not only before creating Auth identities.
    if ((await tx.course.findMany({ where: { code: { in: fixtures.courses.map(c => c.code) } }, select: { id: true } })).length) throw new Error('Colisión de cursos demo; transacción cancelada.');
    const participantType = await tx.participantType.findUnique({ where: { name: 'Externo' } });
    if (!participantType) throw new Error('Falta el catálogo Externo; ejecutar el seed general por separado.');
    const result: Population = { users: [], courses: [], templates: [], enrollments: [], certificates: [] };
    const users = new Map<string, number>();
    for (const account of accounts) {
      const identity = identities.find(i => i.key === account.key);
      if (!identity) throw new Error(`Falta identidad Auth para ${account.key}.`);
      const user = await tx.user.create({ data: {
        authId: identity.authId, name: account.name, email: account.email, role: account.role,
        active: true, emailVerifiedAt: new Date(),
        ...(account.role === 'PARTICIPANT' ? { participantTypeId: participantType.id } : {}),
        ...(account.role === 'INSTRUCTOR' ? { degree: 'ENGINEER' as const } : {})
      } });
      users.set(account.key, user.id);
      result.users.push({ key: account.key, id: String(user.id), authId: identity.authId, email: account.email });
    }
    const adminId = users.get('admin')!; const instructorId = users.get('instructor')!;
    const courseIds = new Map<string, number>();
    const sessionIds = new Map<string, number[]>(); const evaluationIds = new Map<string, number[]>();
    const day = (date: string) => new Date(`${date}T00:00:00Z`);
    for (const c of fixtures.courses) {
      const course = await tx.course.create({ data: {
        code: c.code, name: c.name, content: 'Datos ficticios para demostrar certificados del sprint 3.',
        durationHours: c.durationHours, instructorId, instructor: accounts.find(a => a.key === 'instructor')!.name,
        schedule: '18:00 a 20:00', approvalCriteria: 'Nota mínima 70/100; asistencia mínima 80%.',
        status: 'PUBLISHED', startDate: day(c.startDate), endDate: day(c.endDate), capacity: 20,
        minimumEnrollment: 1, minimumPassingScore: 70, minimumAttendancePercent: 80,
        preinscriptionStart: day(c.preinscriptionStart), preinscriptionEnd: day(c.preinscriptionEnd)
      } });
      courseIds.set(c.key, course.id); result.courses.push({ key: c.key, id: String(course.id), code: c.code });
      await tx.courseInstructor.create({ data: { courseId: course.id, instructorId, assignedById: adminId } });
      await tx.coursePrice.create({ data: { courseId: course.id, participantTypeId: participantType.id, basePrice: 0 } });
      const sessions: number[] = []; const evaluations: number[] = [];
      for (const s of c.sessions) {
        const row = await tx.courseSession.create({ data: { courseId: course.id, sessionNumber: s.number, date: day(s.date), startTime: s.startTime, durationMinutes: s.durationMinutes } });
        sessions.push(row.id);
      }
      for (const e of c.evaluations) {
        const row = await tx.courseEvaluation.create({ data: { courseId: course.id, title: e.title, maxScore: e.maxScore, weight: e.weight } });
        evaluations.push(row.id);
      }
      sessionIds.set(c.key, sessions); evaluationIds.set(c.key, evaluations);
    }
    for (const e of fixtures.enrollments) {
      const courseId = courseIds.get(e.course)!;
      const row = await tx.enrollment.create({ data: {
        courseId, participantId: users.get(e.participant)!, participantTypeId: participantType.id,
        status: e.status, basePrice: 0, finalAmount: 0,
        ...(e.status === 'INSCRITO' ? { confirmedAt: day(fixtures.courses.find(c => c.key === e.course)!.startDate) } : {})
      } });
      result.enrollments.push({ key: e.key, id: String(row.id), participant: e.participant, course: e.course });
      const course = fixtures.courses.find(c => c.key === e.course)!;
      for (const [index, sessionId] of sessionIds.get(e.course)!.entries()) {
        // Future sessions never get attendance records.
        if (course.sessions[index]!.date > fixtures.today) continue;
        await tx.attendance.create({ data: { courseId, sessionId, enrollmentId: row.id, status: index < e.present ? 'PRESENT' : 'ABSENT', recordedById: instructorId } });
      }
      for (const [index, score] of e.grades.entries()) {
        if (score === null) continue;
        await tx.evaluationGrade.create({ data: { evaluationId: evaluationIds.get(e.course)![index]!, enrollmentId: row.id, score, recordedById: instructorId } });
      }
    }
    for (const template of fixtures.templates) {
      const [row] = await tx.$queryRaw<{ id: string }[]>`INSERT INTO public.plantillas_certificados(nombre,tipo,config,clave_inicial,creado_por,actualizado_por)
        VALUES(${template.name},${template.type},${JSON.stringify(template.config)}::jsonb,${template.key},${adminId},${adminId}) RETURNING id::text AS id`;
      if (!row) throw new Error('No se creó la plantilla.');
      result.templates.push({ key: template.type, id: row.id });
    }
    type CertificateRow = { id: string };
    const issue = async (key: string, participant: string, type: 'aprobacion' | 'participacion', template: boolean, previous?: string) => {
      const enrollmentId = result.enrollments.find(e => e.key === `main-${participant}`)!.id;
      const templateId = template ? result.templates.find(t => t.key === type)!.id : null;
      // Retry code collisions without aborting the outer transaction: use a SQL savepoint.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomBytes(4).toString('hex').toUpperCase(); const url = `${publicUrl}/verificar/${code}`;
        await tx.$executeRaw`SAVEPOINT certificate_demo_code`;
        try {
          let rows: { certificate: CertificateRow }[];
          if (previous) rows = await tx.$queryRaw`SELECT public.reissue_certificate(${BigInt(previous)},${code},${url},${BigInt(adminId)},'Reemisión de demostración por corrección de plantilla.',${type},${templateId ? BigInt(templateId) : null}::bigint) AS certificate`;
          else if (templateId) rows = await tx.$queryRaw`SELECT public.emit_certificate_with_template(${BigInt(enrollmentId)},${code},${url},${BigInt(adminId)},${type},${BigInt(templateId)}) AS certificate`;
          else rows = await tx.$queryRaw`SELECT public.emit_certificate_for_type(${BigInt(enrollmentId)},${code},${url},${BigInt(adminId)},${type}) AS certificate`;
          if (!rows[0]?.certificate?.id) throw new Error('La función no devolvió un certificado.');
          const id = String(rows[0].certificate.id);
          result.certificates.push({ key, id, code, url, enrollmentId, initialStatus: 'VALID', ...(previous ? { replacesId: previous } : {}) });
          await tx.$executeRaw`RELEASE SAVEPOINT certificate_demo_code`;
          return id;
        } catch (error) {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT certificate_demo_code`;
          await tx.$executeRaw`RELEASE SAVEPOINT certificate_demo_code`;
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.meta?.code !== '23505' || !String(error.meta?.message).includes('certificados_codigo_verificacion_key')) throw error;
        }
      }
      throw new Error('No se pudo generar un código de certificado único.');
    };
    const revoke = async (id: string) => {
      await tx.$queryRaw`SELECT public.revoke_certificate(${BigInt(id)},${BigInt(adminId)},'Anulación de demostración para corregir el certificado.') AS certificate`;
      result.certificates.find(c => c.id === id)!.initialStatus = 'REVOKED';
    };
    await issue('approval-valid', 'p07', 'aprobacion', false);
    await issue('participation-valid', 'p08', 'participacion', true);
    await revoke(await issue('revoked-ready-to-reissue', 'p09', 'aprobacion', false));
    const original = await issue('history-original', 'p10', 'aprobacion', true);
    await revoke(original);
    await issue('history-replacement', 'p10', 'aprobacion', true, original);
    return result;
  }, { maxWait: 10000, timeout: 120000 });
}

const reference = z.object({ key: z.string(), id: z.string().regex(/^[1-9]\d*$/) });
const populationSchema = z.object({
  users: z.array(reference.extend({ authId: z.string().uuid(), email: z.string().email() })),
  courses: z.array(reference.extend({ code: z.string() })), templates: z.array(reference),
  enrollments: z.array(reference.extend({ participant: z.string(), course: z.string() })),
  certificates: z.array(reference.extend({ code: z.string().regex(/^[0-9A-F]{8}$/), url: z.string().url(), enrollmentId: z.string().regex(/^[1-9]\d*$/), initialStatus: z.enum(['VALID', 'REVOKED']), replacesId: z.string().optional() }))
});
const manifestSchema = z.object({ seedId: z.literal(seedId), projectRef: z.string(), today: z.string(), status: z.enum(['preparing', 'complete', 'failed']),
  accounts: z.array(z.object({ key: z.string(), authId: z.string().uuid() })), population: populationSchema.optional(), orphanAuthIds: z.array(z.string().uuid()).optional() });

export function createPorts(db: PrismaClient, auth: SupabaseClient, config: DemoConfig, manifestPath: string): SeedPorts {
  const fixtures = () => buildFixtures('2026-10-26'); // Only stable keys are used in collision checks.
  async function allAuthUsers() {
    const users = [];
    for (let page = 1; ; page++) {
      const { data, error } = await auth.auth.admin.listUsers({ page, perPage: 100 });
      if (error) throw new Error('No se pudo leer Supabase Auth con SUPABASE_SECRET_KEY.');
      users.push(...data.users);
      if (data.users.length < 100) return users;
    }
  }
  return {
    async preflight() {
      await db.$queryRaw`SELECT 1`;
      // Require all columns used by the Prisma write models, including schemas with legacy additions.
      const modelNames = ['User', 'ParticipantType', 'Course', 'CourseInstructor', 'CoursePrice', 'CourseSession', 'CourseEvaluation', 'Enrollment', 'Attendance', 'EvaluationGrade'];
      const columns = await db.$queryRaw<{ table_name: string; column_name: string; is_nullable: string; column_default: string | null; is_identity: string; is_generated: string }[]>`SELECT table_name,column_name,is_nullable,column_default,is_identity,is_generated FROM information_schema.columns WHERE table_schema='public'`;
      const [sessionTrigger] = await db.$queryRaw<{ available: boolean }[]>`SELECT EXISTS(
        SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
        WHERE t.tgrelid=to_regclass('public.sesiones') AND t.tgname='sesiones_api_time'
        AND p.proname='sync_session_api_time' AND t.tgenabled IN ('O','A') AND (t.tgtype & 6)=6
      ) AS available`;
      const required = new Map<string, Set<string>>();
      for (const model of Prisma.dmmf.datamodel.models.filter(m => modelNames.includes(m.name))) {
        required.set(model.dbName ?? model.name, new Set(model.fields.filter(f => f.kind !== 'object').map(f => f.dbName ?? f.name)));
      }
      required.set('certificados', new Set(['id', 'resultado_curso_id', 'inscripcion_id', 'datos_emision', 'reemplaza_certificado_id', 'motivo_reemision']));
      required.set('resultados_curso', new Set(['id', 'inscripcion_id', 'nota_final', 'porcentaje_asistencia', 'cumple_nota', 'cumple_asistencia', 'estado']));
      required.set('anulaciones_certificados', new Set(['id', 'certificado_id', 'anulado_por', 'motivo']));
      required.set('plantillas_certificados', new Set(['id', 'nombre', 'tipo', 'config', 'clave_inicial', 'version', 'creado_por', 'actualizado_por']));
      for (const [table, names] of required) {
        for (const name of names) if (!columns.some(c => c.table_name === table && c.column_name === name)) throw new Error(`Falta estructura ${table}.${name}; revisar migraciones por separado.`);
        const prismaOwned = Prisma.dmmf.datamodel.models.some(m => modelNames.includes(m.name) && (m.dbName ?? m.name) === table);
        const unexpected = prismaOwned && columns.find(c => c.table_name === table && !names.has(c.column_name)
          && !(table === 'sesiones' && ['hora_inicio','hora_fin'].includes(c.column_name) && sessionTrigger?.available)
          && c.is_nullable === 'NO' && !c.column_default && c.is_identity === 'NO' && c.is_generated === 'NEVER');
        if (unexpected) throw new Error(`Columna obligatoria no compatible: ${table}.${unexpected.column_name}.`);
      }
      const signatures = ['certificate_assessment_for_type(bigint,text)', 'certificate_candidates_for_type(bigint,text)', 'emit_certificate_for_type(bigint,text,text,bigint,text)', 'emit_certificate_with_template(bigint,text,text,bigint,text,bigint)', 'revoke_certificate(bigint,bigint,text)', 'reissue_certificate(bigint,text,text,bigint,text,text,bigint)'];
      for (const signature of signatures) {
        const [row] = await db.$queryRaw<{ available: boolean }[]>`SELECT to_regprocedure(${`public.${signature}`}) IS NOT NULL AS available`;
        if (!row?.available) throw new Error(`Falta la función ${signature}; revisar migraciones por separado.`);
      }
      if (!await db.participantType.findUnique({ where: { name: 'Externo' } })) throw new Error('Falta el catálogo Externo; ejecutar el seed general por separado.');
      const [api, authSettings] = await Promise.all([
        auth.from('cursos').select('id').limit(1),
        fetch(`${config.supabaseUrl}/auth/v1/settings`, { headers: { apikey: config.publishable }, signal: AbortSignal.timeout(15000) })
      ]);
      if (api.error || !authSettings.ok) throw new Error('No se pudo validar acceso a Data API o Auth; revisar las claves del proyecto.');
      await allAuthUsers();
    },
    async readManifest() {
      let content: string;
      try { content = await readFile(manifestPath, 'utf8'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('No se pudo leer el manifiesto local.'); }
      const parsed = manifestSchema.safeParse(JSON.parse(content));
      if (!parsed.success || parsed.data.projectRef !== config.projectRef) throw new Error('Manifiesto inválido o de otro proyecto; no se permite reutilizarlo.');
      return parsed.data;
    },
    async assertVacant() {
      const [users, courses, templates, identities] = await Promise.all([
        db.user.findMany({ where: { email: { in: accounts.map(a => a.email) } }, select: { id: true } }),
        db.course.findMany({ where: { code: { startsWith: 'DEMO-S3-CERT-' } }, select: { id: true } }),
        db.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM public.plantillas_certificados WHERE clave_inicial LIKE ${`${seedId}%`} OR nombre LIKE 'DEMO S3 · %'`,
        allAuthUsers()
      ]);
      if (users.length || courses.length || templates.length || identities.some(u => accounts.some(a => a.email === u.email?.toLowerCase()))) throw new Error('Colisión o carga parcial sin manifiesto: existen registros reservados de esta demo. No se modificaron.');
    },
    async validateExisting(manifest) {
      const p = manifest.population;
      if (!p || p.users.length !== 14 || p.courses.length !== 4 || p.templates.length !== 2 || p.enrollments.length !== 15 || p.certificates.length !== 5) throw new Error('Manifiesto completo sin todas las referencias; revisar carga parcial.');
      const identities = await allAuthUsers();
      for (const account of accounts) {
        const saved = p.users.find(u => u.key === account.key);
        const profile = saved ? await db.user.findUnique({ where: { id: Number(saved.id) } }) : null;
        const identity = identities.find(u => u.id === saved?.authId);
        if (!saved || !profile || profile.email !== account.email || profile.authId !== saved.authId || identity?.email?.toLowerCase() !== account.email || identity.app_metadata?.demo_seed !== seedId) throw new Error('Falta una cuenta o cambió su identidad; revisar carga parcial.');
      }
      for (const course of fixtures().courses) {
        const saved = p.courses.find(c => c.key === course.key);
        const row = saved ? await db.course.findUnique({ where: { id: Number(saved.id) } }) : null;
        if (!row || row.code !== course.code) throw new Error('Falta un curso demo o cambió su identidad.');
      }
      for (const e of p.enrollments) {
        const row = await db.enrollment.findUnique({ where: { id: Number(e.id) } });
        if (!row || row.courseId !== Number(p.courses.find(c => c.key === e.course)?.id) || row.participantId !== Number(p.users.find(u => u.key === e.participant)?.id)) throw new Error('Falta una inscripción demo o cambió su relación.');
      }
      const templates = await db.$queryRaw<{ id: string; clave_inicial: string }[]>`SELECT id::text AS id,clave_inicial FROM public.plantillas_certificados WHERE id IN (${Prisma.join(p.templates.map(t => BigInt(t.id)))})`;
      if (p.templates.some(t => !templates.some(row => row.id === t.id && row.clave_inicial === `${seedId}-${t.key}`))) throw new Error('Falta una plantilla demo.');
      const certificates = await db.$queryRaw<{ id: string; inscripcion_id: string; codigo_verificacion: string }[]>`SELECT id::text AS id,inscripcion_id::text AS inscripcion_id,codigo_verificacion FROM public.certificados WHERE id IN (${Prisma.join(p.certificates.map(c => BigInt(c.id)))})`;
      if (p.certificates.some(c => !certificates.some(row => row.id === c.id && row.inscripcion_id === c.enrollmentId && row.codigo_verificacion === c.code))) throw new Error('Falta un certificado inicial o cambió su identidad.');
      // Deliberately do not compare grades, template versions, states or new certificates.
    },
    async saveManifest(manifest) {
      await mkdir(dirname(manifestPath), { recursive: true });
      const temporary = `${manifestPath}.tmp`;
      await writeFile(temporary, JSON.stringify(manifest, null, 2), { mode: 0o600 });
      await rename(temporary, manifestPath);
    },
    async createAccount(account) {
      if (!config.password || config.password.length < 12) throw new Error('CERTIFICATES_DEMO_PASSWORD debe contener al menos 12 caracteres.');
      const { data, error } = await auth.auth.admin.createUser({ email: account.email, password: config.password, email_confirm: true,
        app_metadata: { demo_seed: seedId }, user_metadata: { full_name: account.name } });
      if (error || !data.user) throw new Error(`No se pudo crear la cuenta demo ${account.key}. Revisar Supabase Auth; no se cambiarán cuentas existentes.`);
      return { key: account.key, authId: data.user.id };
    },
    async deleteAccount(authId) {
      const { error } = await auth.auth.admin.deleteUser(authId);
      if (error) throw new Error('No se pudo compensar una cuenta creada.');
    },
    async confirmRollback(identities) {
      return db.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout='10s'`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(31002610)`;
        return await tx.user.count({ where: { authId: { in: identities.map(a => a.authId) } } }) === 0;
      }, { maxWait: 10000, timeout: 15000 });
    },
    populate: (fixtures, identities) => populateDatabase(db, fixtures, identities, config.publicUrl)
  };
}
