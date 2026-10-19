import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
const local = new URL('../.local/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('full-workflow-dataset.json', local), 'utf8'));
const original = JSON.parse(await readFile(new URL('restored-test-credentials.json', local), 'utf8'));
const added = JSON.parse(await readFile(new URL('full-workflow-credentials.json', local), 'utf8'));
const realAdmin = JSON.parse(await readFile(new URL('admin-initial-credentials.json', local), 'utf8'));
const credentials = [realAdmin, ...original.users, ...added.users];
const base = `http://localhost:${process.env.PUERTO ?? 3000}/api`;
const checks = [];
const tokens = new Map();
const sessions = [];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
async function api(method, path, token, body, expected = 200, binary = false) {
  const response = await fetch(`${base}/${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60000),
  });
  let data =
    binary && response.ok
      ? Buffer.from(await response.arrayBuffer())
      : response.status === 204
        ? null
        : await response.json();
  checks.push({ method, path, status: response.status, expected, passed: response.status === expected });
  assert(
    response.status === expected,
    `${method} ${path}: expected ${expected}, received ${response.status} (${data?.message ?? 'response'})`,
  );
  return data;
}
async function login(email) {
  if (tokens.has(email)) return tokens.get(email);
  const credential = credentials.find((item) => item.email === email);
  assert(credential, `Missing local credentials for ${email}`);
  const session = await api('POST', 'auth/login', null, { email, password: credential.password });
  tokens.set(email, session.accessToken);
  sessions.push(session);
  return session.accessToken;
}
const scenario = (key) => {
  const item = manifest.scenarios.find((item) => item.key === key);
  assert(item, `Missing scenario ${key}`);
  return item;
};
const day = (offset) =>
  new Date(Date.parse(`${manifest.anchorDate}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const stateUrl = new URL('full-workflow-exercise.json', local);
let state = { steps: {} };
try {
  state = JSON.parse(await readFile(stateUrl, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const resume = process.argv.includes('--resume');
if (resume) {
  const prior = JSON.parse(await readFile(new URL('full-workflow-verification-failure.json', local), 'utf8'));
  checks.push(...prior.checks.filter((check) => check.passed));
}
async function step(key, run) {
  if (Object.hasOwn(state.steps, key)) return state.steps[key];
  const result = await run();
  state.steps[key] = result;
  await writeFile(stateUrl, JSON.stringify(state, null, 2));
  return result;
}
try {
  const admin = await login(realAdmin.email);
  const participant = await login('luis@eva.local');
  const instructor = await login('carla.instructor@eva.local');
  const instructorSessions = await Promise.all(
    ['carla.instructor@eva.local', 'diego.flujo@eva.local', 'valeria.flujo@eva.local'].map(async (email) => ({
      email,
      token: await login(email),
    })),
  );
  const samples = [];
  if (!resume) {
    const directory = await api('GET', 'session/users', admin);
    assert(directory.length >= 31, 'The complete user directory is not available.');
    const courses = await api('GET', 'courses', admin);
    assert(courses.length >= 28, 'The administrative course list is incomplete.');
    const catalog = await api('GET', 'courses/catalog');
    assert(
      !catalog.some((course) =>
        manifest.scenarios.filter((item) => item.status === 'DRAFT').some((item) => item.id === course.id),
      ),
      'Draft leaked into public catalog.',
    );
    await api('GET', 'enrollments/courses', admin);
    await api('GET', 'admin/instructors', admin);
    const open = scenario('ABIERTA');
    const page1 = await api('GET', `enrollments?courseId=${open.id}&status=PREINSCRITO&page=1`, admin);
    const page2 = await api('GET', `enrollments?courseId=${open.id}&status=PREINSCRITO&page=2`, admin);
    assert(
      page1.total === 25 && page1.items.length === 20 && page2.items.length === 5,
      'Enrollment pagination failed.',
    );
    const expectedPayment = [
      'PENDIENTE',
      'PARCIAL',
      'PAGADO',
      'PENDIENTE',
      'NO_REQUIERE',
      'PENDIENTE',
      'PAGADO',
    ];
    for (let i = 0; i < 7; i++) {
      const detail = await api('GET', `enrollments/${open.enrollments[i].id}`, admin);
      assert(detail.paymentStatus === expectedPayment[i], `Unexpected payment state in case ${i}`);
    }
    for (const item of manifest.scenarios) {
      await api('GET', `courses/${item.id}/sessions`, admin);
      await api('GET', `courses/${item.id}/evaluations`, admin);
      if (item.status === 'PUBLISHED') await api('GET', `courses/${item.id}/attendance`, admin);
    }
    for (const manager of instructorSessions) {
      const teaching = await api('GET', 'teaching/courses', manager.token);
      assert(teaching.length > 0, 'Instructor has no assigned courses.');
      const me = await api('GET', 'session/me', manager.token);
      await api('GET', `admin/instructors/${me.id}/attendance`, admin);
    }
    const approved = await api('GET', `courses/${scenario('APROBADOS').id}/certificates`, admin);
    assert(
      approved.students.length === 8 &&
        approved.students.every(
          (row) => row.approvalStatus === 'APROBADO' && (!row.blockedReason || row.certificate),
        ),
      'Approved candidate scenario failed.',
    );
    const failed = await api('GET', `courses/${scenario('REPROBADOS').id}/certificates`, admin);
    assert(
      failed.students.every((row) => row.approvalStatus === 'REPROBADO' && row.blockedReason),
      'Failed candidate scenario failed.',
    );
    const attendanceOnly = await api(
      'GET',
      `courses/${scenario('REPROBADOS').id}/certificates?type=participacion`,
      admin,
    );
    assert(
      attendanceOnly.students.filter((row) => row.approvalStatus === 'APROBADO').length === 3,
      'Attendance-only eligibility is incorrect.',
    );
    for (const key of ['NOTAS-PENDIENTES', 'EN-CURSO', 'SIN-SESIONES']) {
      const roster = await api('GET', `courses/${scenario(key).id}/certificates`, admin);
      assert(
        roster.students.every((row) => row.blockedReason),
        'Incomplete requirements must block approval issuance.',
      );
    }
    const participation = await api(
      'GET',
      `courses/${scenario('PARTICIPACION').id}/certificates?type=participacion`,
      admin,
    );
    assert(
      participation.students.every((row) => row.approvalStatus === 'APROBADO'),
      'Participation eligibility failed.',
    );
    await api('POST', `enrollments/${scenario('CERRADA').id}/preenroll`, participant, {}, 400);
    await api('POST', `enrollments/${scenario('LLENO').id}/preenroll`, participant, {}, 400);
    await api('POST', `enrollments/${scenario('BORRADOR').id}/preenroll`, participant, {}, 404);
    await api('POST', `enrollments/${open.id}/preenroll`, null, {}, 401);
    const progress = await api('GET', 'progress/me', participant);
    const passed = progress.find((item) => item.course.id === scenario('APROBADOS').id);
    const notPassed = progress.find((item) => item.course.id === scenario('REPROBADOS').id);
    assert(
      passed?.finalStatus === 'APROBADO' && notPassed?.finalStatus === 'REPROBADO',
      'Participant academic outcomes mismatch.',
    );
    assert(
      progress.find((item) => item.course.id === scenario('NOTAS-PENDIENTES').id)?.finalGrade === null,
      'Incomplete grades must not publish a final grade.',
    );
    for (const item of manifest.scenarios)
      for (const certificate of item.certificates) {
        const verified = await api('GET', `certificates/verify/${certificate.code}`);
        assert(
          verified.status === (certificate.revoked ? 'REVOKED' : 'VALID'),
          'Public certificate state failed.',
        );
        const enrollment = item.enrollments.find((row) => row.id === certificate.enrollmentId);
        const owner = await login(enrollment.participantEmail);
        if (certificate.revoked)
          await api('GET', `certificates/me/${certificate.id}/pdf`, owner, undefined, 409);
        else if (!samples.some((sample) => sample.type === certificate.type)) {
          const bytes = await api(
            'GET',
            `certificates/me/${certificate.id}/pdf`,
            owner,
            undefined,
            200,
            true,
          );
          const pdf = await PDFDocument.load(bytes);
          assert(
            pdf.getPageCount() === 1 && pdf.getSubject()?.includes('sin validez académica'),
            'PDF demonstration marking missing.',
          );
          samples.push({ type: certificate.type, code: certificate.code });
        }
      }
    await api('GET', 'certificates/verify/00000000', null, undefined, 404);
    console.log(JSON.stringify({ phase: 'scenario-reading', passed: true, requests: checks.length }));
  }
  if (process.argv.includes('--exercise') && !state.completed) {
    const learnerEmail = 'alumno20.flujo@eva.local';
    const learner = await login(learnerEmail);
    const other = await login('marta@eva.local');
    const teachingUser = await api('GET', 'session/me', instructor);
    const payload = {
      name: 'Recorrido integral - DEMOSTRACION SIN VALIDEZ ACADEMICA',
      content: 'Caso creado y completado utilizando las rutas reales de la API.',
      durationHours: 1,
      instructor: teachingUser.name,
      instructorId: Number(teachingUser.id),
      schedule: '18:00-19:00',
      approvalCriteria: 'Nota mínima 70 y asistencia mínima 80%.',
      status: 'DRAFT',
      capacity: 5,
      minimumEnrollment: 1,
      startDate: day(2),
      endDate: day(4),
      preinscriptionStart: day(-1),
      preinscriptionEnd: day(1),
    };
    const course = await step('course-created', () => api('POST', 'courses', admin, payload, 201));
    const types = await api('GET', 'participant-types', admin);
    await step('prices', () =>
      api('PUT', `courses/${course.id}/prices`, admin, {
        items: types.map((type) => ({ participantTypeId: type.id, basePrice: 400 })),
      }),
    );
    const sessionPayload = { sessionNumber: 1, date: day(3), startTime: '18:00', durationMinutes: 60 };
    const session = await step('session-created', () =>
      api('POST', `courses/${course.id}/sessions`, admin, sessionPayload, 201),
    );
    await step('published', () => api('PATCH', `courses/${course.id}/publish`, admin, {}));
    const enrollment = await step('preenrolled', () =>
      api('POST', `enrollments/${course.id}/preenroll`, learner, {}, 201),
    );
    await step('duplicate-preenrollment-blocked', () =>
      api('POST', `enrollments/${course.id}/preenroll`, learner, {}, 409),
    );
    await step('missing-payment-blocked', () =>
      api('POST', `enrollments/${enrollment.id}/confirm`, admin, {}, 400),
    );
    await step('scholarship', () =>
      api('PATCH', `enrollments/${enrollment.id}/scholarship`, admin, {
        scholarshipPercent: 25,
        reason: 'PRUEBA: beca del recorrido integral',
      }),
    );
    await step('duplicate-scholarship-blocked', () =>
      api(
        'PATCH',
        `enrollments/${enrollment.id}/scholarship`,
        admin,
        { scholarshipPercent: 25, reason: 'PRUEBA: duplicado' },
        409,
      ),
    );
    await step('scholarship-disabled', () =>
      api('DELETE', `enrollments/${enrollment.id}/scholarship`, admin),
    );
    await step('scholarship-reactivated', () =>
      api('PATCH', `enrollments/${enrollment.id}/scholarship`, admin, {
        scholarshipPercent: 25,
        reason: 'PRUEBA: beca reactivada',
      }),
    );
    await step('partial-payment', () =>
      api('POST', `enrollments/${enrollment.id}/payments`, admin, { amount: 100 }),
    );
    await step('partial-payment-blocked', () =>
      api('POST', `enrollments/${enrollment.id}/confirm`, admin, {}, 400),
    );
    await step('payment-completed', () =>
      api('POST', `enrollments/${enrollment.id}/payments`, admin, { amount: 300 }),
    );
    const confirmed = await step('confirmed', () =>
      api('POST', `enrollments/${enrollment.id}/confirm`, admin, {}),
    );
    assert(
      confirmed.status === 'INSCRITO' && confirmed.finalAmount === 300,
      'Confirmation amount/state failed.',
    );
    await step('future-attendance-blocked', () =>
      api(
        'PUT',
        `courses/${course.id}/sessions/${session.id}/attendance/${enrollment.id}`,
        instructor,
        { status: 'PRESENT' },
        400,
      ),
    );
    await step('unfinished-certificate-blocked', () =>
      api('POST', 'certificates', admin, { enrollmentId: enrollment.id, type: 'aprobacion' }, 400),
    );
    const first = await step('evaluation-1', () =>
      api(
        'POST',
        `courses/${course.id}/evaluations`,
        instructor,
        { title: 'Práctica integral', maxScore: 20, weight: 40 },
        201,
      ),
    );
    const second = await step('evaluation-2', () =>
      api(
        'POST',
        `courses/${course.id}/evaluations`,
        instructor,
        { title: 'Proyecto integral', maxScore: 100, weight: 60 },
        201,
      ),
    );
    await step('excess-weight-blocked', () =>
      api(
        'POST',
        `courses/${course.id}/evaluations`,
        instructor,
        { title: 'Evaluación extra', maxScore: 100, weight: 10 },
        400,
      ),
    );
    await step('grade-1', () =>
      api('PUT', `courses/${course.id}/evaluations/${first.id}/grades/${enrollment.id}`, instructor, {
        score: 16,
        comment: 'PRUEBA: práctica',
      }),
    );
    await step('grade-2', () =>
      api('PUT', `courses/${course.id}/evaluations/${second.id}/grades/${enrollment.id}`, instructor, {
        score: 90,
        comment: 'PRUEBA: proyecto',
      }),
    );
    await step('course-finished', () =>
      api('PUT', `courses/${course.id}`, admin, {
        ...payload,
        status: 'PUBLISHED',
        startDate: day(-3),
        endDate: day(-1),
        preinscriptionStart: day(-10),
        preinscriptionEnd: day(-4),
      }),
    );
    await step('session-completed', () =>
      api('PUT', `courses/${course.id}/sessions/${session.id}`, instructor, {
        ...sessionPayload,
        date: day(-2),
      }),
    );
    await step('attendance-recorded', () =>
      api('PUT', `courses/${course.id}/sessions/${session.id}/attendance/${enrollment.id}`, instructor, {
        status: 'PRESENT',
      }),
    );
    await step('instructor-attendance', () =>
      api('PUT', `admin/instructors/${teachingUser.id}/sessions/${session.id}/attendance`, admin, {
        status: 'PRESENT',
      }),
    );
    await step('session-lock-verified', () =>
      api(
        'PUT',
        `courses/${course.id}/sessions/${session.id}`,
        instructor,
        { ...sessionPayload, date: day(-2) },
        409,
      ),
    );
    const learnerProgress = await api('GET', 'progress/me', learner);
    const result = learnerProgress.find((item) => item.course.id === course.id);
    assert(
      result?.finalGrade === 86 && result.finalStatus === 'APROBADO',
      'Weighted academic result failed.',
    );
    const certificate = await step('certificate-issued', () =>
      api('POST', 'certificates', admin, { enrollmentId: enrollment.id, type: 'aprobacion' }, 201),
    );
    await step('duplicate-certificate-blocked', () =>
      api('POST', 'certificates', admin, { enrollmentId: enrollment.id, type: 'aprobacion' }, 409),
    );
    await api('GET', `certificates/me/${certificate.id}`, other, undefined, 404);
    const publicResult = await api('GET', `certificates/verify/${certificate.code}`);
    assert(publicResult.status === 'VALID', 'Completed flow certificate is not public.');
    const pdfBytes = await api('GET', `certificates/me/${certificate.id}/pdf`, learner, undefined, 200, true);
    assert((await PDFDocument.load(pdfBytes)).getPageCount() === 1, 'Completed flow PDF failed.');
    const pdfUrl = new URL('../../docs/output/recorrido-integral-certificado.pdf', import.meta.url);
    await mkdir(new URL('.', pdfUrl), { recursive: true });
    await writeFile(pdfUrl, pdfBytes);
    state.completed = true;
    state.completedAt = new Date().toISOString();
    state.courseId = course.id;
    state.enrollmentId = enrollment.id;
    state.certificateCode = certificate.code;
    await writeFile(stateUrl, JSON.stringify(state, null, 2));
    console.log(
      JSON.stringify({
        phase: 'end-to-end',
        passed: true,
        courseId: course.id,
        enrollmentId: enrollment.id,
        certificateCode: certificate.code,
      }),
    );
  }
  const report = {
    verifiedAt: new Date().toISOString(),
    scenarioCount: manifest.scenarios.length,
    checks,
    requests: checks.length,
    passed: checks.every((check) => check.passed),
    pdfSamples: samples,
    exerciseCompleted: Boolean(state.completed),
  };
  await writeFile(new URL('full-workflow-verification.json', local), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      passed: report.passed,
      requests: report.requests,
      scenarioCount: report.scenarioCount,
      exerciseCompleted: report.exerciseCompleted,
    }),
  );
} catch (error) {
  await writeFile(
    new URL('full-workflow-verification-failure.json', local),
    JSON.stringify({ at: new Date().toISOString(), error: error.message, checks }, null, 2),
  );
  console.error('Workflow verification failed:', error.message);
  process.exitCode = 1;
} finally {
  for (const token of tokens.values())
    try {
      await fetch(`${base}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
    } catch {}
}
