import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../shared/http-error.js';
import type { CourseInput } from './course.rules.js';

const courseSelect = {
  id: true,
  code: true,
  name: true,
  content: true,
  durationHours: true,
  instructor: true,
  schedule: true,
  approvalCriteria: true,
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
  createdAt: course.createdAt.toISOString(),
  updatedAt: course.updatedAt.toISOString()
});

const toCourseData = (input: CourseInput) => ({
  ...input,
  code: input.code ?? null
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
  async list() {
    const courses = await prisma.course.findMany({
      select: courseSelect,
      orderBy: { createdAt: 'desc' }
    });

    return courses.map(toCourseResponse);
  },

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
  }
};
