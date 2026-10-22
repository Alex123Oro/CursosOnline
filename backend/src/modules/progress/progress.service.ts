import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { RequestUser } from '../../shared/auth.js';
import { HttpError } from '../../shared/http-error.js';
import { boliviaToday } from '../attendance/attendance.rules.js';

const dateOnly = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const round = (value: number) => Math.round(value * 100) / 100;

const courseSelect = {
  id: true, code: true, name: true, instructorId: true, status: true,
  startDate: true, endDate: true, minimumPassingScore: true, minimumAttendancePercent: true,
  sessions: { select: { id: true, date: true, sessionNumber: true, startTime: true, durationMinutes: true }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] },
  evaluations: {
    select: { id: true, title: true, maxScore: true, weight: true,
      grades: { select: { enrollmentId: true, score: true, comment: true, gradedAt: true } } },
    orderBy: { createdAt: 'asc' }
  }
} satisfies Prisma.CourseSelect;
const enrollmentInclude = {
  course: { select: courseSelect },
  attendance: { select: { status: true, session: { select: { id: true, date: true } } } }
} satisfies Prisma.EnrollmentInclude;
type ProgressEnrollment = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentInclude }>;

type Computed = ReturnType<typeof compute>;
function compute(enrollment: ProgressEnrollment, today: string) {
  const course = enrollment.course;
  const completedSessions = course.sessions.filter(session => (dateOnly(session.date) ?? '') <= today);
  const presentSessions = enrollment.attendance.filter(attendance =>
    attendance.status === 'PRESENT' && (dateOnly(attendance.session.date) ?? '') <= today
  ).length;
  const attendancePercent = completedSessions.length ? round(presentSessions / completedSessions.length * 100) : null;
  const attendanceBySession = new Map(enrollment.attendance.map(record => [record.session.id, record.status]));
  const attendanceComplete = completedSessions.length > 0 && completedSessions.every(session => attendanceBySession.has(session.id));
  const attendanceHistory = course.sessions.filter(session => (dateOnly(session.date) ?? '') <= today).map(session => ({
    sessionId: String(session.id), sessionNumber: session.sessionNumber, date: dateOnly(session.date)!,
    startTime: session.startTime, durationMinutes: session.durationMinutes,
    status: attendanceBySession.get(session.id) === 'PRESENT' ? 'PRESENT' : attendanceBySession.get(session.id) === 'ABSENT' ? 'ABSENT' : null
  }));
  const evaluations = course.evaluations.map(evaluation => {
    const grade = evaluation.grades.find(item => item.enrollmentId === enrollment.id);
    const score = grade ? Number(grade.score) : null;
    const maxScore = Number(evaluation.maxScore);
    const weight = Number(evaluation.weight);
    return { id: String(evaluation.id), title: evaluation.title, score, maxScore, weight,
      comment: grade?.comment ?? null, gradedAt: grade?.gradedAt.toISOString() ?? null,
      percentage: score === null ? null : round(score / maxScore * 100) };
  });
  const graded = evaluations.filter(evaluation => evaluation.score !== null);
  const weightTotal = graded.reduce((sum, evaluation) => sum + evaluation.weight, 0);
  const configuredWeight = evaluations.reduce((sum, evaluation) => sum + evaluation.weight, 0);
  const currentGrade = weightTotal ? round(graded.reduce((sum, evaluation) =>
    sum + (evaluation.score! / evaluation.maxScore * 100) * evaluation.weight, 0) / weightTotal) : null;
  const endDate = dateOnly(course.endDate);
  const isFinished = Boolean(endDate && endDate < today);
  const allEvaluationsGraded = evaluations.length > 0 && graded.length === evaluations.length;
  const weightComplete = Math.abs(configuredWeight - 100) < 0.000001;
  const finalGrade = enrollment.status === 'INSCRITO' && isFinished && allEvaluationsGraded && weightComplete && attendanceComplete &&
    attendancePercent !== null && completedSessions.length === course.sessions.length ? currentGrade : null;
  const minimumPassingScore = Number(course.minimumPassingScore);
  const minimumAttendancePercent = Number(course.minimumAttendancePercent ?? 80);
  const finalStatus = finalGrade === null || attendancePercent === null ? null :
    finalGrade < minimumPassingScore ? 'REPROBADO' :
      attendancePercent < minimumAttendancePercent ? 'NO_CUMPLE_ASISTENCIA' : 'APROBADO';
  return {
    enrollmentId: String(enrollment.id), enrollmentStatus: enrollment.status,
    course: { id: String(course.id), code: course.code ?? '', name: course.name,
      startDate: dateOnly(course.startDate), endDate },
    attendance: { presentSessions, completedSessions: completedSessions.length, percentage: attendancePercent, sessions: attendanceHistory },
    evaluations, currentGrade, finalGrade, minimumPassingScore,
    requirements: { academicMet: finalGrade === null ? null : finalGrade >= minimumPassingScore,
      attendanceMet: attendancePercent === null || !attendanceComplete ? null : attendancePercent >= minimumAttendancePercent,
      minimumAttendancePercent },
    finalStatus, certificateEligible: finalStatus === 'APROBADO', weightComplete, isFinished
  };
}

async function authorizedCourse(courseId: number, user: RequestUser) {
  if (user.role !== 'ADMIN' && user.role !== 'INSTRUCTOR') throw new HttpError(403, 'No tienes permisos para consultar resultados.');
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, instructorId: true } });
  if (!course) throw new HttpError(404, 'Curso no encontrado.');
  if (user.role === 'INSTRUCTOR' && course.instructorId !== user.id) {
    const assigned = await prisma.courseInstructor.findUnique({
      where: { courseId_instructorId: { courseId, instructorId: user.id } }, select: { id: true }
    });
    if (!assigned) throw new HttpError(403, 'No eres instructor asignado a este curso.');
  }
}

async function getCourseProgress(courseId: number) {
  const enrollments = await prisma.enrollment.findMany({ where: { courseId, status: 'INSCRITO' },
    include: { ...enrollmentInclude, participant: { select: { id: true, name: true } } },
    orderBy: { id: 'asc' } });
  return enrollments.map(enrollment => ({ participantId: String(enrollment.participant.id),
    participantName: enrollment.participant.name, ...compute(enrollment, boliviaToday()) }));
}

export const progressService = {
  async listForParticipant(participantId: number) {
    const enrollments = await prisma.enrollment.findMany({ where: { participantId }, include: enrollmentInclude, orderBy: { createdAt: 'desc' } });
    return enrollments.map(enrollment => compute(enrollment, boliviaToday()));
  },
  async listCourseResults(courseId: number, user: RequestUser) {
    await authorizedCourse(courseId, user);
    return getCourseProgress(courseId);
  },
  async calculateCourseResults(courseId: number, user: RequestUser) {
    await authorizedCourse(courseId, user);
    const results = await getCourseProgress(courseId);
    // Los datos incompletos nunca se marcan como aprobados ni reprobados.
    for (const result of results) {
      const enrollmentId = Number(result.enrollmentId);
      const status = result.finalStatus === 'APROBADO' ? 'PASSED' :
        result.finalStatus === 'REPROBADO' ? 'FAILED' :
          result.finalStatus === 'NO_CUMPLE_ASISTENCIA' ? 'ATTENDANCE_NOT_MET' : 'PENDING';
      await prisma.courseResult.upsert({
        where: { enrollmentId },
        create: { enrollmentId, courseId, status, finalScore: result.finalGrade,
          attendancePercent: result.attendance.percentage, recordedById: user.id,
          calculatedAt: status === 'PENDING' ? null : new Date() },
        update: { status, finalScore: result.finalGrade, attendancePercent: result.attendance.percentage,
          recordedById: user.id, calculatedAt: status === 'PENDING' ? null : new Date() }
      });
    }
    return { courseId: String(courseId), results, savedCount: results.length };
  }
};
