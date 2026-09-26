import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../shared/http-error.js';
import { canPublishCourse, type CourseInput } from './course.rules.js';

const courseSelect = {
  id: true,
  code: true,
  name: true,
  content: true,
  durationHours: true,
  instructor: true,
  schedule: true,
  approvalCriteria: true,
  status: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.CourseSelect;

type CourseRecord = Prisma.CourseGetPayload<{ select: typeof courseSelect }>;

const toCourseResponse = (course: CourseRecord) => ({
  id: String(course.id),
  code: course.code ?? '',
  name: course.name,
  content: course.content ?? '',
  durationHours: course.durationHours ?? 0,
  instructor: course.instructor ?? '',
  schedule: course.schedule ?? '',
  approvalCriteria: course.approvalCriteria ?? '',
  status: course.status ?? 'DRAFT',
  startDate: course.startDate ? course.startDate.toISOString().slice(0, 10) : null,
  endDate: course.endDate ? course.endDate.toISOString().slice(0, 10) : null,
  createdAt: course.createdAt.toISOString(),
  updatedAt: course.updatedAt.toISOString()
});

const toCourseData = (input: CourseInput) => ({
  ...input,
  code: input.code ?? null,
  status: input.status ?? 'DRAFT',
  startDate: input.startDate ? new Date(input.startDate) : null,
  endDate: input.endDate ? new Date(input.endDate) : null
});

const handlePrismaError = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new HttpError(409, 'Ya existe un curso con ese codigo.', [
      { path: 'code', message: 'El codigo ya esta registrado.' }
    ]);
  }

  throw error;
};

export const courseService = {
  /**
   * Lista todos los cursos para el panel administrativo.
   */
  async list() {
    const courses = await prisma.course.findMany({
      select: courseSelect,
      orderBy: { createdAt: 'desc' }
    });

    return courses.map(toCourseResponse);
  },

  /**
   * Devuelve solo los cursos publicados para el catálogo público.
   */
  async catalog() {
    const courses = await prisma.course.findMany({
      where: { status: 'PUBLISHED' },
      select: courseSelect,
      orderBy: { createdAt: 'desc' }
    });

    return courses.map(toCourseResponse);
  },

  /**
   * Devuelve un curso publicado para el detalle público.
   */
  async catalogById(id: number) {
    const course = await prisma.course.findFirst({
      where: { id, status: 'PUBLISHED' },
      select: courseSelect
    });

    return course ? toCourseResponse(course) : null;
  },

  /**
   * Crea un curso nuevo en estado borrador.
   */
  async create(input: CourseInput) {
    try {
      const course = await prisma.course.create({
        data: toCourseData(input),
        select: courseSelect
      });

      return toCourseResponse(course);
    } catch (error) {
      handlePrismaError(error);
    }
  },

  /**
   * Actualiza la información del curso.
   */
  async update(id: number, input: CourseInput) {
    try {
      const course = await prisma.course.update({
        where: { id },
        data: toCourseData(input),
        select: courseSelect
      });

      return toCourseResponse(course);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new HttpError(404, 'Curso no encontrado.');
      }

      handlePrismaError(error);
    }
  },

  /**
   * Publica un curso solo si cumple con la información mínima requerida.
   */
  async publish(id: number) {
    const existing = await prisma.course.findUnique({
      where: { id },
      select: courseSelect
    });

    if (!existing) {
      throw new HttpError(404, 'Curso no encontrado.');
    }

    canPublishCourse({
      instructor: existing.instructor,
      schedule: existing.schedule,
      startDate: existing.startDate ? existing.startDate.toISOString().slice(0, 10) : null,
      endDate: existing.endDate ? existing.endDate.toISOString().slice(0, 10) : null
    });

    try {
      const course = await prisma.course.update({
        where: { id },
        data: { status: 'PUBLISHED' },
        select: courseSelect
      });

      return toCourseResponse(course);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new HttpError(404, 'Curso no encontrado.');
      }

      throw error;
    }
  }
};
