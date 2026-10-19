import { Prisma, type AttendanceStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../shared/http-error.js';
import type { RequestUser } from '../../shared/auth.js';
import { boliviaToday } from '../attendance/attendance.rules.js';
import { endTime } from '../course-sessions/course-session.rules.js';
import { requireAdministrator, type InstructorAttendanceFilters } from './instructor-attendance.rules.js';

const instructorWhere = {
  OR: [
    { role: 'INSTRUCTOR' },
    { teachingAttendance: { some: {} } },
    { courseAssignments: { some: {} } }
  ]
} satisfies Prisma.UserWhereInput;

const courseSelect = {
  id: true, name: true, code: true, instructorId: true, status: true
} satisfies Prisma.CourseSelect;

const sessionInclude = {
  course: { select: courseSelect },
  instructorAttendance: true
} satisfies Prisma.CourseSessionInclude;

type Session = Prisma.CourseSessionGetPayload<{ include: typeof sessionInclude }>;

const toRow = (session: Session, today: string, assigned: boolean) => ({
  id: String(session.id),
  date: session.date.toISOString().slice(0, 10),
  startTime: session.startTime,
  endTime: endTime(session.startTime, session.durationMinutes),
  editable: assigned && session.date.toISOString().slice(0, 10) <= today,
  blockedReason: !assigned
    ? 'El instructor no está asignado actualmente al curso.'
    : session.date.toISOString().slice(0, 10) > today
      ? 'No se puede registrar asistencia de una sesión futura.' : null,
  course: { id: String(session.courseId), name: session.course.name, code: session.course.code ?? '' },
  status: session.instructorAttendance?.status ?? null,
  updatedAt: session.instructorAttendance?.updatedAt.toISOString() ?? null,
  recordedById: session.instructorAttendance ? String(session.instructorAttendance.recordedById) : null
});

const assignedToCourse = async (tx: Prisma.TransactionClient, courseId: number, instructorId: number) => {
  const course = await tx.course.findUnique({ where: { id: courseId }, select: courseSelect });
  if (!course) throw new HttpError(404, 'Curso no encontrado.');
  if (course.status !== 'PUBLISHED') throw new HttpError(400, 'El curso debe estar publicado.');
  if (course.instructorId === instructorId) return true;
  const assignment = await tx.courseInstructor.findUnique({
    where: { courseId_instructorId: { courseId, instructorId } }, select: { id: true }
  });
  return Boolean(assignment);
};

export const instructorAttendanceService = {
  async instructors(user: RequestUser) {
    requireAdministrator(user);
    const instructors = await prisma.user.findMany({
      where: instructorWhere, select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }]
    });
    return instructors.map(row => ({ id: String(row.id), name: row.name }));
  },

  async list(instructorId: number, filters: InstructorAttendanceFilters, user: RequestUser) {
    requireAdministrator(user);
    const instructor = await prisma.user.findFirst({
      where: { id: instructorId, ...instructorWhere }, select: { id: true, name: true }
    });
    if (!instructor) throw new HttpError(404, 'Instructor no encontrado.');

    const today = boliviaToday();
    const courseFilter: Prisma.CourseWhereInput = {
      status: 'PUBLISHED',
      OR: [
        { instructorId },
        { instructorAssignments: { some: { instructorId } } },
        { sessions: { some: { instructorAttendance: { is: { instructorId } } } } }
      ]
    };
    const [courses, sessions] = await Promise.all([
      prisma.course.findMany({
        where: courseFilter, select: courseSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }]
      }),
      prisma.courseSession.findMany({
        where: {
          course: { status: 'PUBLISHED' },
          ...(filters.courseId ? { courseId: filters.courseId } : {}),
          ...(filters.from || filters.to ? {
            date: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {})
            }
          } : {}),
          OR: [
            { instructorAttendance: { is: { instructorId } } },
            { instructorAttendance: { is: null }, course: { instructorId } },
            { instructorAttendance: { is: null }, course: { instructorAssignments: { some: { instructorId } } } }
          ]
        },
        include: sessionInclude,
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }, { id: 'desc' }]
      })
    ]);

    const assignments = await prisma.courseInstructor.findMany({
      where: { instructorId, courseId: { in: sessions.map(session => session.courseId) } },
      select: { courseId: true }
    });
    const assignedIds = new Set(assignments.map(item => item.courseId));
    const rows = sessions.map(session => toRow(
      session, today,
      session.course.instructorId === instructorId || assignedIds.has(session.courseId)
    ));
    const eligible = rows.filter(row => row.date <= today);

    return {
      instructor: { id: String(instructor.id), name: instructor.name },
      today,
      courses: courses.map(course => ({
        id: String(course.id), name: course.name, code: course.code ?? ''
      })),
      sessions: rows,
      summary: {
        present: eligible.filter(row => row.status === 'PRESENT').length,
        absent: eligible.filter(row => row.status === 'ABSENT').length,
        pending: eligible.filter(row => row.status === null).length
      }
    };
  },

  async save(instructorId: number, sessionId: number, status: AttendanceStatus, user: RequestUser) {
    requireAdministrator(user);
    const initial = await prisma.courseSession.findUnique({
      where: { id: sessionId }, select: { courseId: true }
    });
    if (!initial) throw new HttpError(404, 'Sesión no encontrada.');

    return prisma.$transaction(async tx => {
      // Mantener el orden de bloqueos curso -> sesión.
      await tx.$queryRaw`SELECT id FROM cursos WHERE id = ${initial.courseId} FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM sesiones WHERE id = ${sessionId} AND curso_id = ${initial.courseId} FOR UPDATE`;
      const session = await tx.courseSession.findUnique({
        where: { id: sessionId }, include: sessionInclude
      });
      if (!session || session.courseId !== initial.courseId) {
        throw new HttpError(404, 'Sesión no encontrada en el curso.');
      }
      const today = boliviaToday();
      if (session.date.toISOString().slice(0, 10) > today) {
        throw new HttpError(400, 'No se puede registrar asistencia de una sesión futura.');
      }
      const assigned = await assignedToCourse(tx, session.courseId, instructorId);
      if (session.instructorAttendance) {
        if (session.instructorAttendance.instructorId !== instructorId) {
          throw new HttpError(409, 'La sesión ya tiene asistencia de otro instructor. No se puede transferir el registro.');
        }
      } else if (!assigned) {
        throw new HttpError(400, 'El instructor no está asignado a este curso.');
      }

      const saved = await tx.instructorAttendance.upsert({
        where: { sessionId },
        create: { courseId: session.courseId, sessionId, instructorId, status, recordedById: user.id },
        update: { status, recordedById: user.id }
      });
      return toRow({ ...session, instructorAttendance: saved }, today, assigned);
    });
  }
};
