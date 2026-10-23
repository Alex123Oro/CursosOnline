import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const container = process.env.FLOW_TEST_CONTAINER ?? '';
describe.skipIf(!container)('corrected business flows (isolated PostgreSQL only)', () => {
  let db: PrismaClient;
  let services: { courses: typeof import('../src/modules/courses/course.service.js').courseService;
    enrollments: typeof import('../src/modules/enrollments/enrollment.service.js').enrollmentService;
    sessions: typeof import('../src/modules/course-sessions/course-session.service.js').courseSessionService;
    instructors: typeof import('../src/modules/instructors/instructor.service.js').instructorService;
    instructorAttendance: typeof import('../src/modules/instructor-attendance/instructor-attendance.service.js').instructorAttendanceService;
    attendance: typeof import('../src/modules/attendance/attendance.service.js').attendanceService;
    evaluations: typeof import('../src/modules/progress/evaluation.service.js').evaluationService;
    progress: typeof import('../src/modules/progress/progress.service.js').progressService };
  let admin: any, teacher: any, other: any, participant: any, type: any;
  const day = (offset: number) => { const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/La_Paz'}).format(new Date()); const d = new Date(today+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10); };
  beforeAll(async () => {
    if (!container.startsWith('eva-certificates-test-')) throw Error('Unsafe container');
    const setup = spawnSync(process.execPath,['scripts/prepare-flow-test.mjs'],{encoding:'utf8',env:process.env,timeout:60000});
    if (setup.status !== 0) throw Error('Cannot prepare isolated flow test schema: '+setup.stderr);
    const inspected = spawnSync('docker',['inspect',container],{encoding:'utf8'});
    if (inspected.status !== 0) throw Error('Cannot inspect isolated container');
    const [info] = JSON.parse(inspected.stdout); if (info.Config.Labels['eva.certificates.test'] !== 'true') throw Error('Unsafe container label');
    const binding = info.NetworkSettings.Ports['5432/tcp'][0]; if (binding.HostIp !== '127.0.0.1') throw Error('Unsafe database host');
    const password = info.Config.Env.find((s: string) => s.startsWith('POSTGRES_PASSWORD=')).slice(18);
    process.env.DATABASE_URL = `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${binding.HostPort}/eva_flow_fixes_test?schema=public&connection_limit=4`;
    db = (await import('../src/config/prisma.js')).prisma;
    services = {
      courses: (await import('../src/modules/courses/course.service.js')).courseService,
      enrollments: (await import('../src/modules/enrollments/enrollment.service.js')).enrollmentService,
      sessions: (await import('../src/modules/course-sessions/course-session.service.js')).courseSessionService,
      instructors: (await import('../src/modules/instructors/instructor.service.js')).instructorService,
      instructorAttendance: (await import('../src/modules/instructor-attendance/instructor-attendance.service.js')).instructorAttendanceService,
      attendance: (await import('../src/modules/attendance/attendance.service.js')).attendanceService,
      evaluations: (await import('../src/modules/progress/evaluation.service.js')).evaluationService,
      progress: (await import('../src/modules/progress/progress.service.js')).progressService
    };
    type = await db.participantType.create({ data: { name: 'Flow '+randomUUID() } });
    const user = (role: any) => db.user.create({ data: { authId: randomUUID(), name: 'Isolated '+role, email: randomUUID()+'@example.test', role, participantTypeId: role === 'PARTICIPANT' ? type.id : null } });
    [admin,teacher,other,participant] = await Promise.all([user('ADMIN'),user('INSTRUCTOR'),user('INSTRUCTOR'),user('PARTICIPANT')]);
  },30000);
  async function prepared(capacity = 5) {
    const course = await services.courses.create({ name: 'Isolated '+randomUUID().slice(0,8), content: 'Synthetic flow integration', durationHours: 1,
      instructor: teacher.name, instructorId: teacher.id, approvalCriteria: 'Nota y asistencia', capacity, minimumEnrollment: 1,
      startDate: day(-10), endDate: day(-1), preinscriptionStart: day(-20), preinscriptionEnd: day(1) });
    const id = Number(course.id);
    await services.courses.replacePrices(id,[{ participantTypeId: type.id, basePrice: 100 }]);
    const session = await services.sessions.create(id,{ sessionNumber: 1, date: day(-2), startTime: '10:00', durationMinutes: 60 },admin);
    await services.courses.publish(id);
    return { id, sessionId: Number(session.id) };
  }
  it('accumulates immutable movements, retries once and protects confirmed funding', async () => {
    const {id} = await prepared(); const enrollment = await services.enrollments.preenroll(id,participant); const eid = Number(enrollment.id);
    const requestId = randomUUID();
    expect((await services.enrollments.registerPayment(eid,40,admin.id,requestId)).paymentAmount).toBe(40);
    expect((await services.enrollments.registerPayment(eid,40,admin.id,requestId)).paymentAmount).toBe(40);
    const remaining = randomUUID();
    expect((await services.enrollments.registerPayment(eid,undefined,admin.id,remaining)).paymentAmount).toBe(100);
    expect((await services.enrollments.registerPayment(eid,undefined,admin.id,remaining)).paymentAmount).toBe(100);
    expect(await db.paymentMovement.count({where:{enrollmentId:eid}})).toBe(2);
    await expect(services.enrollments.close(eid,'CANCELADO','Cambio de planes',participant)).rejects.toMatchObject({statusCode:409});
    await services.enrollments.confirm(eid,admin.id);
    await expect(services.enrollments.movement(eid,{kind:'DEVOLUCION',amount:1,reason:'Devolución de prueba',requestId:randomUUID()},admin.id)).rejects.toMatchObject({statusCode:409});
    await expect(db.paymentMovement.updateMany({where:{enrollmentId:eid},data:{reason:'Alteración'}})).rejects.toThrow();
  });
  it('releases unpaid capacity, retains history and rejects unauthorized cancellation', async () => {
    const {id} = await prepared(1); const row = await services.enrollments.preenroll(id,participant); const eid = Number(row.id);
    await expect(services.enrollments.close(eid,'CANCELADO','Cambio de planes',{...participant,id:teacher.id})).rejects.toMatchObject({statusCode:403});
    await services.enrollments.close(eid,'CANCELADO','Cambio de planes',participant);
    expect((await services.courses.catalogById(id,participant.id))?.remainingSlots).toBe(1);
    expect((await services.courses.catalogById(id,participant.id))?.enrollment).toBeNull();
    expect((await services.enrollments.preenroll(id,participant)).id).toBe(row.id);
    await services.enrollments.close(eid,'RECHAZADO','Revisión administrativa',admin);
    await expect(services.enrollments.preenroll(id,participant)).rejects.toMatchObject({statusCode:409});
    expect(await db.enrollmentEvent.count({where:{enrollmentId:eid}})).toBe(4);
  });
  it('expires only unpaid reservations after the Bolivia closing date', async () => {
    const a = await prepared(); const b = await prepared();
    const unpaid = await services.enrollments.preenroll(a.id,participant); const paid = await services.enrollments.preenroll(b.id,participant);
    await services.enrollments.registerPayment(Number(paid.id),10,admin.id);
    await db.course.updateMany({where:{id:{in:[a.id,b.id]}},data:{preinscriptionEnd:new Date(day(-1))}});
    await services.enrollments.expire();
    expect((await services.enrollments.detail(Number(unpaid.id))).status).toBe('CADUCADO');
    expect((await services.enrollments.detail(Number(paid.id))).status).toBe('PREINSCRITO');
  });
  it('keeps a published teacher and records each assigned instructor independently', async () => {
    const {id,sessionId} = await prepared();
    const first = await services.instructors.assign(id,teacher.id,admin.id);
    await expect(services.instructors.removeAssignment(first.id)).rejects.toMatchObject({statusCode:409});
    await services.instructors.assign(id,other.id,admin.id);
    await services.instructorAttendance.save(teacher.id,sessionId,'PRESENT',admin);
    await services.instructorAttendance.save(other.id,sessionId,'ABSENT',admin);
    expect(await db.instructorAttendance.count({where:{sessionId}})).toBe(2);
    expect((await services.instructorAttendance.list(teacher.id,{courseId:id},admin)).sessions[0].status).toBe('PRESENT');
    expect((await services.instructorAttendance.list(other.id,{courseId:id},admin)).sessions[0].status).toBe('ABSENT');
    await services.instructors.removeAssignment(first.id);
    expect((await db.course.findUniqueOrThrow({where:{id}})).instructorId).toBe(other.id);
  });
  it('invalidates corrected results and requires revocation and a new immutable certificate snapshot', async () => {
    const {id,sessionId} = await prepared(); const row = await services.enrollments.preenroll(id,participant); const eid = Number(row.id);
    await services.enrollments.registerPayment(eid,100,admin.id); await services.enrollments.confirm(eid,admin.id);
    await expect(services.courses.unpublish(id)).rejects.toMatchObject({statusCode:409});
    await services.attendance.save(id,sessionId,eid,'PRESENT',teacher);
    const evaluation = await services.evaluations.create(id,{title:'Final',maxScore:100,weight:100},teacher);
    await services.evaluations.recordGrade(id,Number(evaluation.id),eid,{score:90},teacher);
    await services.progress.calculateCourseResults(id,teacher);
    await services.attendance.save(id,sessionId,eid,'ABSENT',teacher);
    expect((await db.courseResult.findUniqueOrThrow({where:{enrollmentId:eid}})).status).toBe('PENDING');
    await services.attendance.save(id,sessionId,eid,'PRESENT',teacher);
    const code = randomUUID().replaceAll('-','').slice(0,8).toUpperCase();
    const [issued] = await db.$queryRawUnsafe<any[]>(`SELECT public.emit_certificate_for_type($1::bigint,$2::text,$3::text,$4::bigint,'aprobacion') AS value`,eid,code,'https://example.test/'+code,admin.id);
    const cert = issued.value;
    const [original] = await db.$queryRawUnsafe<any[]>('SELECT to_jsonb(r) AS value FROM resultados_curso r WHERE id=$1::bigint',Number(cert.resultado_curso_id));
    await expect(services.evaluations.recordGrade(id,Number(evaluation.id),eid,{score:95},teacher)).rejects.toMatchObject({statusCode:409});
    await expect(db.evaluationGrade.updateMany({where:{enrollmentId:eid},data:{score:95}})).rejects.toThrow();
    await db.$queryRawUnsafe('SELECT public.revoke_certificate($1::bigint,$2::bigint,$3::text)',Number(cert.id),admin.id,'Corrección de calificación');
    await services.evaluations.recordGrade(id,Number(evaluation.id),eid,{score:95},teacher);
    await expect(db.$queryRawUnsafe("SELECT emit_certificate_for_type($1::bigint,'ABCD1234','https://example.test/ABCD1234',$2::bigint,'aprobacion')",eid,admin.id)).rejects.toThrow();
    const newCode = randomUUID().replaceAll('-','').slice(0,8).toUpperCase();
    const [replacement] = await db.$queryRawUnsafe<any[]>("SELECT public.reissue_certificate($1::bigint,$2::text,$3::text,$4::bigint,'Nota corregida y revisada','aprobacion',NULL) AS value",Number(cert.id),newCode,'https://example.test/'+newCode,admin.id);
    expect(String(replacement.value.reemplaza_certificado_id)).toBe(String(cert.id));
    expect(replacement.value.codigo_verificacion).not.toBe(code);
    const [preserved] = await db.$queryRawUnsafe<any[]>('SELECT to_jsonb(r) AS value FROM resultados_curso r WHERE id=$1::bigint',Number(cert.resultado_curso_id));
    expect(preserved).toEqual(original);
    const [roster] = await db.$queryRawUnsafe<any[]>("SELECT public.certificate_candidates_for_type($1::bigint,'aprobacion') AS value",id);
    expect(roster.value.students).toHaveLength(1); expect(roster.value.students[0].history).toHaveLength(2);
    expect(roster.value.students[0].history.map((h: any) => h.status)).toEqual(['VALID','REVOKED']);
  });
});
