import { Prisma, type CourseSession } from '@prisma/client';
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
const sessionResponse = (session: CourseSession, course: SessionCourse) => ({
  id: String(session.id), courseId: String(session.courseId), date: dateOnly(session.date)!,
  startTime: session.startTime, durationMinutes: session.durationMinutes,
  endTime: endTime(session.startTime, session.durationMinutes),
  warning: periodWarning(dateOnly(session.date)!, dateOnly(course.startDate), dateOnly(course.endDate)),
  createdAt: session.createdAt.toISOString(), updatedAt: session.updatedAt.toISOString()
});
const authorizedCourse = async (courseId: number, user: RequestUser) => {
  if (user.role !== 'ADMIN' && user.role !== 'INSTRUCTOR') throw new HttpError(403, 'No tienes permisos para gestionar sesiones.');
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: courseSelect });
  if (!course) throw new HttpError(404, 'Curso no encontrado.');
  if (user.role === 'INSTRUCTOR' && course.instructorId !== user.id) throw new HttpError(403, 'No eres el instructor asignado a este curso.');
  if (course.status !== 'PUBLISHED') throw new HttpError(400, 'Solo se pueden gestionar sesiones de cursos publicados.');
  return course;
};
const handleError = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new HttpError(409, 'Ya existe una sesión del curso con esa fecha y hora.');
    if (error.code === 'P2025') throw new HttpError(404, 'Sesión no encontrada.');
  }
  throw error;
};
const authorizeWrite = (user: RequestUser) => { if (user.role !== 'ADMIN') throw new HttpError(403, 'Solo el administrador puede programar o editar sesiones.'); };
export const courseSessionService = {
  async schedule(courseId: number, input: RecurrenceInput, user: RequestUser) {
    authorizeWrite(user);
    const course = await authorizedCourse(courseId, user);
    const dates = recurrenceDates(input);
    const created = await prisma.courseSession.createManyAndReturn({
      skipDuplicates: true,
      data: dates.map(date => ({ courseId, date: new Date(date), startTime: input.startTime, durationMinutes: input.durationMinutes }))
    });
    const sessions = await prisma.courseSession.findMany({ where: { courseId }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }] });
    return { createdCount: created.length, skippedCount: dates.length - created.length, sessions: sessions.map(session => sessionResponse(session, course)) };
  },
  async teachingCourses(user: RequestUser) {
    if (user.role !== 'INSTRUCTOR') throw new HttpError(403, 'Esta consulta corresponde a instructores.');
    const courses = await prisma.course.findMany({ where: { status: 'PUBLISHED', instructorId: user.id }, select: courseSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    return courses.map(courseResponse);
  },
  async list(courseId: number, user: RequestUser) {
    const course = await authorizedCourse(courseId, user);
    const sessions = await prisma.courseSession.findMany({ where: { courseId }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }] });
    return { course: courseResponse(course), sessions: sessions.map(session => sessionResponse(session, course)) };
  },
  async create(courseId: number, input: SessionInput, user: RequestUser) {
    authorizeWrite(user);
    const course = await authorizedCourse(courseId, user);
    try {
      const session = await prisma.courseSession.create({ data: { ...input, date: new Date(input.date), courseId } });
      return sessionResponse(session, course);
    } catch (error) { handleError(error); }
  },
  async update(courseId: number, sessionId: number, input: SessionInput, user: RequestUser) {
    authorizeWrite(user);
    const course = await authorizedCourse(courseId, user);
    const existing = await prisma.courseSession.findUnique({ where: { id: sessionId } });
    if (!existing || existing.courseId !== courseId) throw new HttpError(404, 'Sesión no encontrada en este curso.');
    try {
      const session = await prisma.courseSession.update({ where: { id: sessionId, courseId }, data: { ...input, date: new Date(input.date) } });
      return sessionResponse(session, course);
    } catch (error) { handleError(error); }
  }
};
