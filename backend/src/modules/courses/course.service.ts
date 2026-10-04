import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { RequestUser } from '../../shared/auth.js';
import { HttpError } from '../../shared/http-error.js';
import { canPublishCourse, type CourseInput, type CoursePricesInput } from './course.rules.js';

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
  capacity: true,
  preinscriptionStart: true,
  preinscriptionEnd: true,
  createdAt: true,
  updatedAt: true,
  prices: {
    select: {
      participantTypeId: true,
      basePrice: true,
      participantType: {
        select: { name: true }
      }
    },
    orderBy: { participantTypeId: 'asc' }
  },
  _count: {
    select: { enrollments: true }
  }
} satisfies Prisma.CourseSelect;

type CourseRecord = Prisma.CourseGetPayload<{ select: typeof courseSelect }>;

const toMoney = (value: Prisma.Decimal | number) => Number(value);

export const toCourseResponse = (course: CourseRecord, enrollment?: {
  id: number;
  status: string;
  basePrice: Prisma.Decimal | number;
  scholarshipPercent: Prisma.Decimal | number;
  benefitAmount: Prisma.Decimal | number;
  finalAmount: Prisma.Decimal | number;
  payment: { id: number } | null;
} | null) => ({
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
  capacity: course.capacity ?? null,
  preinscriptionStart: course.preinscriptionStart ? course.preinscriptionStart.toISOString().slice(0, 10) : null,
  preinscriptionEnd: course.preinscriptionEnd ? course.preinscriptionEnd.toISOString().slice(0, 10) : null,
  occupiedSlots: course._count.enrollments,
  remainingSlots: course.capacity === null ? null : Math.max(0, course.capacity - course._count.enrollments),
  prices: course.prices.map(price => ({
    participantTypeId: String(price.participantTypeId),
    participantTypeName: price.participantType.name,
    basePrice: toMoney(price.basePrice)
  })),
  createdAt: course.createdAt.toISOString(),
  updatedAt: course.updatedAt.toISOString(),
  enrollment: enrollment
    ? {
        id: String(enrollment.id),
        status: enrollment.status,
        basePrice: toMoney(enrollment.basePrice),
        scholarshipPercent: toMoney(enrollment.scholarshipPercent),
        benefitAmount: toMoney(enrollment.benefitAmount),
        finalAmount: toMoney(enrollment.finalAmount),
        paymentRegistered: Boolean(enrollment.payment)
      }
    : null
});

const toCourseData = (input: CourseInput) => ({
  code: input.code ?? null,
  name: input.name,
  content: input.content,
  durationHours: input.durationHours,
  instructor: input.instructor,
  schedule: input.schedule,
  approvalCriteria: input.approvalCriteria,
  startDate: input.startDate ? new Date(input.startDate) : null,
  endDate: input.endDate ? new Date(input.endDate) : null,
  capacity: input.capacity ?? null,
  preinscriptionStart: input.preinscriptionStart ? new Date(input.preinscriptionStart) : null,
  preinscriptionEnd: input.preinscriptionEnd ? new Date(input.preinscriptionEnd) : null
});

const publicationContext = (input: CourseInput) => ({
  instructor: input.instructor,
  schedule: input.schedule,
  startDate: input.startDate ?? null,
  endDate: input.endDate ?? null,
  capacity: input.capacity ?? null,
  preinscriptionStart: input.preinscriptionStart ?? null,
  preinscriptionEnd: input.preinscriptionEnd ?? null
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

    return courses.map(course => toCourseResponse(course));
  },

  async catalog() {
    const courses = await prisma.course.findMany({
      where: { status: 'PUBLISHED' },
      select: courseSelect,
      orderBy: { createdAt: 'desc' }
    });

    return courses.map(course => toCourseResponse(course));
  },

  async catalogById(id: number, user?: RequestUser | null) {
    const course = await prisma.course.findFirst({
      where: { id, status: 'PUBLISHED' },
      select: courseSelect
    });

    if (!course) {
      return null;
    }

    if (!user || user.role !== 'PARTICIPANT') {
      return toCourseResponse(course);
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        courseId_participantId: {
          courseId: id,
          participantId: user.id
        }
      },
      include: { payment: { select: { id: true } } }
    });

    return toCourseResponse(course, enrollment);
  },

  async create(input: CourseInput) {
    try {
      const course = await prisma.course.create({
        data: {
          ...toCourseData(input),
          status: 'DRAFT'
        },
        select: courseSelect
      });

      return toCourseResponse(course);
    } catch (error) {
      handlePrismaError(error);
    }
  },

  async update(id: number, input: CourseInput) {
    const existing = await prisma.course.findUnique({
      where: { id },
      select: { status: true }
    });

    if (!existing) {
      throw new HttpError(404, 'Curso no encontrado.');
    }

    if (existing.status === 'PUBLISHED') {
      canPublishCourse(publicationContext(input));
    }

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
      endDate: existing.endDate ? existing.endDate.toISOString().slice(0, 10) : null,
      capacity: existing.capacity,
      preinscriptionStart: existing.preinscriptionStart ? existing.preinscriptionStart.toISOString().slice(0, 10) : null,
      preinscriptionEnd: existing.preinscriptionEnd ? existing.preinscriptionEnd.toISOString().slice(0, 10) : null
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
  },

  async replacePrices(id: number, input: CoursePricesInput) {
    const existing = await prisma.course.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!existing) {
      throw new HttpError(404, 'Curso no encontrado.');
    }

    const typeIds = [...new Set(input.items.map(item => item.participantTypeId))];
    const types = await prisma.participantType.findMany({
      where: { id: { in: typeIds } },
      select: { id: true }
    });

    if (types.length !== typeIds.length) {
      throw new HttpError(400, 'Uno o mas tipos de participante no existen.');
    }

    await prisma.$transaction([
      prisma.coursePrice.deleteMany({ where: { courseId: id } }),
      prisma.coursePrice.createMany({
        data: input.items.map(item => ({
          courseId: id,
          participantTypeId: item.participantTypeId,
          basePrice: item.basePrice
        }))
      })
    ]);

    const course = await prisma.course.findUniqueOrThrow({
      where: { id },
      select: courseSelect
    });

    return toCourseResponse(course);
  }
};
