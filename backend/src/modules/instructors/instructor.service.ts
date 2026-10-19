import { Prisma, type User } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../shared/http-error.js';
import { instructorAuth } from './instructor-auth.js';
import { degreeLabel, degreeValues, type InstructorInput } from './instructor.rules.js';

const toResponse = (user: User) => ({
  id: String(user.id), name: user.name, email: user.email,
  degree: degreeLabel(user.degree), sis: user.sis, phone: user.phone,
  role: user.role, participantTypeId: null, participantTypeName: null
});

const definitivePersistenceFailure = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return false;
  if ('name' in error && error.name === 'PrismaClientValidationError') return true;
  return 'code' in error && typeof error.code === 'string' &&
    ['P2000', 'P2002', 'P2003', 'P2004', 'P2011', 'P2012', 'P2014', 'P2025'].includes(error.code);
};

const duplicate = (paths: string[]) => new HttpError(409, 'Ya existe una cuenta con estos datos.',
  paths.map(path => ({ path, message: path === 'sis' ? 'El SIS ya está registrado.' : 'El correo ya está registrado.' })));

const assignmentSelect = {
  id: true, courseId: true, instructorId: true, assignedById: true, assignedAt: true,
  course: { select: { id: true, name: true, code: true, status: true } },
  instructor: { select: { id: true, name: true, email: true } }
} satisfies Prisma.CourseInstructorSelect;

async function assertInstructor(id: number) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!user || user.role !== 'INSTRUCTOR') throw new HttpError(400, 'El usuario seleccionado no es un instructor válido.');
}

export const instructorService = {
  async create(input: InstructorInput) {
    let existing;
    try {
      existing = await prisma.user.findFirst({
        where: { OR: [{ email: { equals: input.email, mode: 'insensitive' } }, { sis: input.sis }] },
        select: { email: true, sis: true }
      });
    } catch { throw new HttpError(500, 'No se pudo verificar el instructor.'); }
    if (existing) {
      const paths: string[] = [];
      if (existing.email.toLowerCase() === input.email) paths.push('email');
      if (existing.sis === input.sis) paths.push('sis');
      throw duplicate(paths);
    }
    let authId: string;
    try { authId = await instructorAuth.createIdentity({ name: input.name, email: input.email, password: input.password }); }
    catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(503, 'No se pudo crear la cuenta de acceso.'); }
    try {
      const user = await prisma.user.create({ data: {
        authId, name: input.name, email: input.email, degree: degreeValues[input.degree],
        sis: input.sis, phone: input.phone, role: 'INSTRUCTOR', participantTypeId: null
      } });
      return toResponse(user);
    } catch (error) {
      if (!definitivePersistenceFailure(error)) {
        let persisted;
        try { persisted = await prisma.user.findUnique({ where: { authId } }); }
        catch {
          console.error('instructor_profile_creation_unresolved', { authId });
          throw new HttpError(503, 'No se pudo confirmar el alta del instructor.');
        }
        if (persisted) {
          if (persisted.authId === authId && persisted.email === input.email && persisted.sis === input.sis &&
              persisted.name === input.name && persisted.phone === input.phone && persisted.degree === degreeValues[input.degree] &&
              persisted.role === 'INSTRUCTOR' && persisted.participantTypeId === null) return toResponse(persisted);
          console.error('instructor_profile_creation_unresolved', { authId });
          throw new HttpError(503, 'No se pudo confirmar el alta del instructor.');
        }
      }
      try { await instructorAuth.deleteIdentity(authId); }
      catch {
        console.error('instructor_identity_cleanup_failed', { authId });
        throw new HttpError(500, 'No se pudo completar el alta del instructor.');
      }
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        const target = 'meta' in error ? (error.meta as { target?: unknown } | undefined)?.target : undefined;
        const targets = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
        const columns = { email: ['email', 'correo', 'User_email_key', 'usuarios_correo_key'], sis: ['sis', 'codigo_sis', 'User_sis_key', 'usuarios_codigo_sis_key'] };
        throw duplicate(Object.entries(columns).filter(([, names]) => targets.some(value => typeof value === 'string' && names.includes(value))).map(([field]) => field));
      }
      throw new HttpError(500, 'No se pudo guardar el instructor.');
    }
  },

  async assignments(courseId?: number) {
    return prisma.courseInstructor.findMany({
      where: courseId === undefined ? {} : { courseId },
      select: assignmentSelect, orderBy: [{ courseId: 'asc' }, { assignedAt: 'asc' }]
    });
  },

  async assign(courseId: number, instructorId: number, assignedById?: number) {
    await assertInstructor(instructorId);
    try {
      return await prisma.$transaction(async tx => {
        const course = await tx.course.findUnique({ where: { id: courseId }, select: { id: true, instructorId: true } });
        if (!course) throw new HttpError(404, 'Curso no encontrado.');
        const assignment = await tx.courseInstructor.create({
          data: { courseId, instructorId, ...(assignedById ? { assignedById } : {}) },
          select: assignmentSelect
        });
        if (course.instructorId === null) {
          await tx.course.update({ where: { id: courseId }, data: { instructorId, instructor: assignment.instructor.name } });
        }
        return assignment;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new HttpError(409, 'Este instructor ya está asignado al curso.');
      }
      throw error;
    }
  },

  async changeAssignment(assignmentId: number, instructorId: number) {
    await assertInstructor(instructorId);
    try {
      return await prisma.$transaction(async tx => {
        const existing = await tx.courseInstructor.findUnique({ where: { id: assignmentId } });
        if (!existing) throw new HttpError(404, 'Asignación no encontrada.');
        const updated = await tx.courseInstructor.update({
          where: { id: assignmentId }, data: { instructorId }, select: assignmentSelect
        });
        const course = await tx.course.findUnique({ where: { id: existing.courseId }, select: { instructorId: true } });
        if (course?.instructorId === existing.instructorId) {
          const primaryStillAssigned = await tx.courseInstructor.findFirst({
            where: { courseId: existing.courseId, instructorId: existing.instructorId }
          });
          if (!primaryStillAssigned) {
            await tx.course.update({ where: { id: existing.courseId },
              data: { instructorId, instructor: updated.instructor.name } });
          }
        }
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new HttpError(409, 'Este instructor ya está asignado al curso.');
      }
      throw error;
    }
  },

  async removeAssignment(assignmentId: number) {
    return prisma.$transaction(async tx => {
      const existing = await tx.courseInstructor.findUnique({ where: { id: assignmentId } });
      if (!existing) throw new HttpError(404, 'Asignación no encontrada.');
      await tx.courseInstructor.delete({ where: { id: assignmentId } });
      const course = await tx.course.findUnique({ where: { id: existing.courseId }, select: { instructorId: true } });
      if (course?.instructorId === existing.instructorId) {
        const replacement = await tx.courseInstructor.findFirst({
          where: { courseId: existing.courseId }, orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
          include: { instructor: { select: { name: true } } }
        });
        await tx.course.update({ where: { id: existing.courseId }, data: {
          instructorId: replacement?.instructorId ?? null, instructor: replacement?.instructor.name ?? null
        } });
      }
      return { deleted: true };
    });
  }
};
