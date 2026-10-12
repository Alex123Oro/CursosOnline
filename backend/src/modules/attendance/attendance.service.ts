import { Prisma, type AttendanceStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../shared/http-error.js';
import type { RequestUser } from '../../shared/auth.js';
import { endTime } from '../course-sessions/course-session.rules.js';
import { boliviaToday } from './attendance.rules.js';

const courseSelect = { id: true, code: true, name: true, instructor: true, instructorId: true, status: true } satisfies Prisma.CourseSelect;
const enrollmentInclude = { participant: { select: { name: true } }, attendance: { select: { sessionId: true, status: true, updatedAt: true } } } satisfies Prisma.EnrollmentInclude;
type RosterEnrollment = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentInclude }>;
type SessionDate = { id: number; date: Date };
const authorizedCourse = async (client: Prisma.TransactionClient, courseId: number, user: RequestUser) => {
  if (user.role !== 'ADMIN' && user.role !== 'INSTRUCTOR') throw new HttpError(403, 'No tienes permisos para gestionar asistencia.');
  const course = await client.course.findUnique({ where: { id: courseId }, select: courseSelect });
  if (!course) throw new HttpError(404, 'Curso no encontrado.');
  if (user.role === 'INSTRUCTOR' && course.instructorId !== user.id) throw new HttpError(403, 'No eres el instructor asignado a este curso.');
  if (course.status !== 'PUBLISHED') throw new HttpError(400, 'Solo se puede gestionar asistencia de cursos publicados.');
  return course;
};
const summarize = (enrollment: RosterEnrollment, sessions: SessionDate[], today: string) => {
  const eligible = new Set(sessions.filter(session => session.date.toISOString().slice(0, 10) <= today).map(session => session.id));
  const records = enrollment.attendance.filter(record => eligible.has(record.sessionId));
  const presentCount = records.filter(record => record.status === 'PRESENT').length;
  const absentCount = records.length - presentCount;
  return {
    enrollmentId: String(enrollment.id), participantId: String(enrollment.participantId), name: enrollment.participant.name,
    presentCount, absentCount, pendingCount: Math.max(0, eligible.size - records.length),
    percentage: records.length ? Math.round(presentCount / records.length * 1000) / 10 : null,
    attendance: enrollment.attendance.map(record => ({ sessionId: String(record.sessionId), status: record.status, updatedAt: record.updatedAt.toISOString() }))
  };
};
export const attendanceService = {
  async list(courseId: number, user: RequestUser) {
    const course = await authorizedCourse(prisma, courseId, user);
    const today = boliviaToday();
    const [sessions, enrollments] = await Promise.all([
      prisma.courseSession.findMany({ where: { courseId }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }] }),
      prisma.enrollment.findMany({ where: { courseId, status: 'INSCRITO' }, include: enrollmentInclude, orderBy: [{ participant: { name: 'asc' } }, { id: 'asc' }] })
    ]);
    return {
      course: { id: String(course.id), code: course.code ?? '', name: course.name, instructor: course.instructor ?? '' }, today,
      sessions: sessions.map(session => ({ id: String(session.id), date: session.date.toISOString().slice(0, 10), startTime: session.startTime, endTime: endTime(session.startTime, session.durationMinutes), editable: session.date.toISOString().slice(0, 10) <= today })),
      students: enrollments.map(enrollment => summarize(enrollment, sessions, today))
    };
  },
  async save(courseId: number, sessionId: number, enrollmentId: number, status: AttendanceStatus, user: RequestUser) {
    return prisma.$transaction(async tx => {
      // Serialize changes to this student while keeping different students independent.
      await tx.$queryRaw`SELECT id FROM cursos WHERE id = ${courseId} FOR SHARE`;
      await authorizedCourse(tx, courseId, user);
      await tx.$queryRaw`SELECT id FROM sesiones_curso WHERE id = ${sessionId} AND curso_id = ${courseId} FOR SHARE`;
      const session = await tx.courseSession.findUnique({ where: { id: sessionId } });
      if (!session || session.courseId !== courseId) throw new HttpError(404, 'Sesión no encontrada en este curso.');
      const today = boliviaToday();
      if (session.date.toISOString().slice(0, 10) > today) throw new HttpError(400, 'No se puede registrar asistencia de una sesión futura.');
      await tx.$queryRaw`SELECT id FROM inscripciones WHERE id = ${enrollmentId} AND curso_id = ${courseId} FOR UPDATE`;
      const enrollment = await tx.enrollment.findUnique({ where: { id: enrollmentId }, include: enrollmentInclude });
      if (!enrollment || enrollment.courseId !== courseId) throw new HttpError(404, 'El alumno no pertenece a este curso.');
      if (enrollment.status !== 'INSCRITO') throw new HttpError(400, 'Solo se puede registrar asistencia de alumnos oficialmente inscritos.');
      const saved = await tx.attendance.upsert({
        where: { sessionId_enrollmentId: { sessionId, enrollmentId } },
        create: { courseId, sessionId, enrollmentId, status, recordedById: user.id },
        update: { status, recordedById: user.id },
        select: { sessionId: true, status: true, updatedAt: true }
      });
      const sessions = await tx.courseSession.findMany({ where: { courseId }, select: { id: true, date: true } });
      return summarize({ ...enrollment, attendance: [...enrollment.attendance.filter(record => record.sessionId !== sessionId), saved] }, sessions, today);
    });
  }
};
