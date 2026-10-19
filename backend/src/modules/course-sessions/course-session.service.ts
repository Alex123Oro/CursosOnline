import { Prisma, type CourseSession, type AttendanceStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { RequestUser } from '../../shared/auth.js';
import { HttpError } from '../../shared/http-error.js';
import {
  endTime,
  periodWarning,
  recurrenceDates,
  type RecurrenceInput,
  type SessionInput
} from './course-session.rules.js';

const courseSelect = {
  id: true,
  code: true,
  name: true,
  instructor: true,
  instructorId: true,
  status: true,
  startDate: true,
  endDate: true
} satisfies Prisma.CourseSelect;

type SessionCourse = Prisma.CourseGetPayload<{ select: typeof courseSelect }>;

const dateOnly = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

const courseResponse = (course: SessionCourse) => ({
  id: String(course.id),
  code: course.code ?? '',
  name: course.name,
  instructor: course.instructor ?? '',
  instructorId: course.instructorId == null ? null : String(course.instructorId),
  status: course.status,
  startDate: dateOnly(course.startDate),
  endDate: dateOnly(course.endDate)
});

const sessionInclude = {
  instructorAttendance: { select: { status: true } },
  _count: { select: { attendance: true } }
} satisfies Prisma.CourseSessionInclude;

type ManagedSession = CourseSession & {
  instructorAttendance?: { status: AttendanceStatus } | null;
  _count?: { attendance: number };
};

const sessionResponse = (session: ManagedSession, course: SessionCourse) => ({
  id: String(session.id),
  courseId: String(session.courseId),
  date: dateOnly(session.date)!,
  sessionNumber: session.sessionNumber,
  locked: Boolean(session.instructorAttendance) || (session._count?.attendance ?? 0) > 0,
  instructorAttendanceStatus: session.instructorAttendance?.status ?? null,
  startTime: session.startTime,
  durationMinutes: session.durationMinutes,
  endTime: endTime(session.startTime, session.durationMinutes),
  warning: periodWarning(dateOnly(session.date)!, dateOnly(course.startDate), dateOnly(course.endDate)),
  createdAt: session.createdAt.toISOString(),
  updatedAt: session.updatedAt.toISOString()
});

type Db = Pick<Prisma.TransactionClient, 'course' | 'courseInstructor'>;

async function authorizedCourse(courseId: number, user: RequestUser, db: Db = prisma) {
  if (user.role !== 'ADMIN' && user.role !== 'INSTRUCTOR') {
    throw new HttpError(403, 'No tienes permisos para gestionar sesiones.');
  }

  const course = await db.course.findUnique({ where: { id: courseId }, select: courseSelect });
  if (!course) throw new HttpError(404, 'Curso no encontrado.');

  if (user.role === 'INSTRUCTOR') {
    const assigned = course.instructorId === user.id || Boolean(await db.courseInstructor.findUnique({
      where: { courseId_instructorId: { courseId, instructorId: user.id } },
      select: { id: true }
    }));
    if (!assigned) throw new HttpError(403, 'No eres instructor asignado a este curso.');
    if (course.status !== 'PUBLISHED') {
      throw new HttpError(400, 'Solo se pueden gestionar sesiones de cursos publicados.');
    }
  }

  return course;
}

function handleError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new HttpError(409, 'Ya existe una sesión con el mismo número, fecha u hora en el curso.');
    if (error.code === 'P2025') throw new HttpError(404, 'Sesión no encontrada.');
    if (error.code === 'P2003') throw new HttpError(409, 'No se puede eliminar una sesión que ya tiene registros asociados.');
  }
  throw error;
}

async function withUnlockedSession<T>(
  courseId: number,
  sessionId: number,
  user: RequestUser,
  write: (tx: Prisma.TransactionClient, course: SessionCourse) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async tx => {
    // Se mantiene el orden de bloqueo curso -> sesión para reducir conflictos.
    await tx.$queryRaw`SELECT id FROM cursos WHERE id = ${courseId} FOR SHARE`;
    const course = await authorizedCourse(courseId, user, tx);
    if (user.role === 'ADMIN' && course.status !== 'DRAFT') {
      throw new HttpError(403, 'Solo un instructor asignado puede editar sesiones de cursos publicados.');
    }

    // Evita el borrado o edición simultánea mientras se registra asistencia.
    await tx.$queryRaw`SELECT id FROM sesiones WHERE id = ${sessionId} AND curso_id = ${courseId} FOR UPDATE`;
    const session = await tx.courseSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
    if (!session || session.courseId !== courseId) throw new HttpError(404, 'Sesión no encontrada en este curso.');
    if (session.instructorAttendance || session._count.attendance > 0) {
      throw new HttpError(409, 'La sesión ya tiene asistencias registradas y no se puede modificar ni eliminar.');
    }
    return write(tx, course);
  });
}

export const courseSessionService = {
  async teachingCourses(user: RequestUser) {
    if (user.role !== 'INSTRUCTOR') throw new HttpError(403, 'Esta consulta corresponde a instructores.');
    const courses = await prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [
          { instructorId: user.id },
          { instructorAssignments: { some: { instructorId: user.id } } }
        ]
      },
      select: courseSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }]
    });
    return courses.map(courseResponse);
  },

  async list(courseId: number, user: RequestUser) {
    const course = await authorizedCourse(courseId, user);
    const sessions = await prisma.courseSession.findMany({
      where: { courseId },
      include: sessionInclude,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }]
    });
    return { course: courseResponse(course), sessions: sessions.map(session => sessionResponse(session, course)) };
  },

  async create(courseId: number, input: SessionInput, user: RequestUser) {
    try {
      return await prisma.$transaction(async tx => {
        const course = await authorizedCourse(courseId, user, tx);
        const session = await tx.courseSession.create({
          data: { ...input, date: new Date(input.date), courseId },
          include: sessionInclude
        });
        return sessionResponse(session, course);
      });
    } catch (error) { return handleError(error); }
  },

  async schedule(courseId: number, input: RecurrenceInput, user: RequestUser) {
    const dates = recurrenceDates(input);
    try {
      return await prisma.$transaction(async tx => {
        // Serializa programaciones concurrentes del mismo curso.
        await tx.$queryRaw`SELECT id FROM cursos WHERE id = ${courseId} FOR UPDATE`;
        const course = await authorizedCourse(courseId, user, tx);
        const last = await tx.courseSession.findFirst({
          where: { courseId }, orderBy: { sessionNumber: 'desc' }, select: { sessionNumber: true }
        });
        let nextNumber = (last?.sessionNumber ?? 0) + 1;
        let createdCount = 0;
        let skippedCount = 0;

        for (const date of dates) {
          const duplicate = await tx.courseSession.findFirst({
            where: { courseId, date: new Date(date), startTime: input.startTime }, select: { id: true }
          });
          if (duplicate) { skippedCount++; continue; }
          await tx.courseSession.create({
            data: { courseId, sessionNumber: nextNumber++, date: new Date(date), startTime: input.startTime, durationMinutes: input.durationMinutes }
          });
          createdCount++;
        }

        const sessions = await tx.courseSession.findMany({
          where: { courseId }, include: sessionInclude,
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }]
        });
        return { createdCount, skippedCount, sessions: sessions.map(session => sessionResponse(session, course)) };
      });
    } catch (error) { return handleError(error); }
  },

  async update(courseId: number, sessionId: number, input: SessionInput, user: RequestUser) {
    try {
      return await withUnlockedSession(courseId, sessionId, user, async (tx, course) => {
        const session = await tx.courseSession.update({
          where: { id: sessionId, courseId },
          data: { ...input, date: new Date(input.date) },
          include: sessionInclude
        });
        return sessionResponse(session, course);
      });
    } catch (error) { return handleError(error); }
  },

  async remove(courseId: number, sessionId: number, user: RequestUser) {
    try {
      await withUnlockedSession(courseId, sessionId, user, tx =>
        tx.courseSession.delete({ where: { id: sessionId, courseId } })
      );
    } catch (error) { return handleError(error); }
  }
};
