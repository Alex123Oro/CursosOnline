import { Prisma, type CourseSession, type AttendanceStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { RequestUser } from '../../shared/auth.js';
import { HttpError } from '../../shared/http-error.js';
import { endTime, periodWarning, recurrenceDates, type RecurrenceInput, type SessionInput } from './course-session.rules.js';

const courseSelect = { id: true, code: true, name: true, instructor: true, instructorId: true, status: true, startDate: true, endDate: true } satisfies Prisma.CourseSelect;
type SessionCourse = Prisma.CourseGetPayload<{ select: typeof courseSelect }>;
const dateOnly = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;
const courseResponse = (course: SessionCourse) => ({
  id: String(course.id), code: course.code ?? '', name: course.name, instructor: course.instructor ?? '',
  instructorId: course.instructorId === null ? null : String(course.instructorId),
  startDate: dateOnly(course.startDate), endDate: dateOnly(course.endDate)
});
const sessionInclude = { instructorAttendance: { select: { status: true } } } satisfies Prisma.CourseSessionInclude;
type ManagedSession = CourseSession & { instructorAttendance?: { status: AttendanceStatus } | null };
const sessionResponse = (session: ManagedSession, course: SessionCourse) => ({
  id: String(session.id), courseId: String(session.courseId), date: dateOnly(session.date)!,
  sessionNumber: session.sessionNumber,
  locked: Boolean(session.instructorAttendance),
  instructorAttendanceStatus: session.instructorAttendance?.status ?? null,
  startTime: session.startTime, durationMinutes: session.durationMinutes,
  endTime: endTime(session.startTime, session.durationMinutes),
  warning: periodWarning(dateOnly(session.date)!, dateOnly(course.startDate), dateOnly(course.endDate)),
  createdAt: session.createdAt.toISOString(), updatedAt: session.updatedAt.toISOString()
});
const authorizedCourse = async (courseId: number, user: RequestUser, db: Pick<Prisma.TransactionClient, 'course'> = prisma) => {
  if (user.role !== 'ADMIN' && user.role !== 'INSTRUCTOR') throw new HttpError(403, 'No tienes permisos para gestionar sesiones.');
  const course = await db.course.findUnique({ where: { id: courseId }, select: courseSelect });
  if (!course) throw new HttpError(404, 'Curso no encontrado.');
  if (user.role === 'INSTRUCTOR' && course.instructorId !== user.id) throw new HttpError(403, 'No eres el instructor asignado a este curso.');
  if (course.status !== 'PUBLISHED') throw new HttpError(400, 'Solo se pueden gestionar sesiones de cursos publicados.');
  return course;
};
const handleError = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new HttpError(409, 'Ya existe una sesión con ese número, fecha y hora en el curso.');
    if (error.code === 'P2025') throw new HttpError(404, 'Sesión no encontrada.');
  }
  throw error;
};
const authorizeWrite = (user: RequestUser) => { if (user.role !== 'INSTRUCTOR') throw new HttpError(403, 'Solo el instructor asignado puede editar o eliminar sesiones.'); };
const authorizePlanning = (user: RequestUser) => { if (user.role !== 'ADMIN' && user.role !== 'INSTRUCTOR') throw new HttpError(403, 'Solo el administrador o el instructor asignado puede programar sesiones.'); };
const withUnlockedSession = async <T>(courseId: number, sessionId: number, user: RequestUser,
  write: (tx: Prisma.TransactionClient, course: SessionCourse) => Promise<T>) => {
  authorizeWrite(user);
  return prisma.$transaction(async tx => {
    // Same course → session lock order as administrator attendance recording.
    await tx.$queryRaw`SELECT id FROM cursos WHERE id = ${courseId} FOR SHARE`;
    const course = await authorizedCourse(courseId, user, tx);
    await tx.$queryRaw`SELECT id FROM sesiones_curso WHERE id = ${sessionId} AND curso_id = ${courseId} FOR UPDATE`;
    const session = await tx.courseSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
    if (!session || session.courseId !== courseId) throw new HttpError(404, 'Sesión no encontrada en este curso.');
    if (session.instructorAttendance) throw new HttpError(409, 'La sesión está bloqueada porque el administrador ya registró la asistencia del instructor. No se puede editar ni eliminar.');
    return write(tx, course);
  });
};
export const courseSessionService = {
  async remove(courseId: number, sessionId: number, user: RequestUser) {
    try {
      await withUnlockedSession(courseId, sessionId, user, tx => tx.courseSession.delete({ where: { id: sessionId, courseId } }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new HttpError(409, 'No se puede eliminar una sesión con asistencia registrada de alumnos o del instructor.');
      }
      handleError(error);
    }
  },
  async schedule(courseId: number, input: RecurrenceInput, user: RequestUser) {
    authorizePlanning(user);
    const course = await authorizedCourse(courseId, user);
    const dates = recurrenceDates(input);
    const last = await prisma.courseSession.findFirst({ where: { courseId }, orderBy: { sessionNumber: 'desc' }, select: { sessionNumber: true } });
    const nextNumber = (last?.sessionNumber ?? 0) + 1;
    const created = await prisma.courseSession.createManyAndReturn({
      skipDuplicates: true,
      data: dates.map((date, index) => ({ courseId, sessionNumber: nextNumber + index, date: new Date(date), startTime: input.startTime, durationMinutes: input.durationMinutes }))
    });
    const sessions = await prisma.courseSession.findMany({ where: { courseId }, include: sessionInclude, orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }] });
    return { createdCount: created.length, skippedCount: dates.length - created.length, sessions: sessions.map(session => sessionResponse(session, course)) };
  },
  async teachingCourses(user: RequestUser) {
    if (user.role !== 'INSTRUCTOR') throw new HttpError(403, 'Esta consulta corresponde a instructores.');
    const courses = await prisma.course.findMany({ where: { status: 'PUBLISHED', instructorId: user.id }, select: courseSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    return courses.map(courseResponse);
  },
  async list(courseId: number, user: RequestUser) {
    const course = await authorizedCourse(courseId, user);
    const sessions = await prisma.courseSession.findMany({ where: { courseId }, include: sessionInclude, orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }] });
    return { course: courseResponse(course), sessions: sessions.map(session => sessionResponse(session, course)) };
  },
  async create(courseId: number, input: SessionInput, user: RequestUser) {
    authorizePlanning(user);
    const course = await authorizedCourse(courseId, user);
    try {
      const session = await prisma.courseSession.create({ data: { ...input, date: new Date(input.date), courseId } });
      return sessionResponse(session, course);
    } catch (error) { handleError(error); }
  },
  async update(courseId: number, sessionId: number, input: SessionInput, user: RequestUser) {
    try {
      return await withUnlockedSession(courseId, sessionId, user, async (tx, course) => {
        const session = await tx.courseSession.update({ where: { id: sessionId, courseId }, data: { ...input, date: new Date(input.date) }, include: sessionInclude });
        return sessionResponse(session, course);
      });
    } catch (error) { handleError(error); }
  }
};
