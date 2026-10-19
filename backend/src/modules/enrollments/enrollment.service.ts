import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { RequestUser } from '../../shared/auth.js';
import { calculateEnrollmentAmount } from '../../shared/enrollment-amount.js';
import { HttpError } from '../../shared/http-error.js';
import { isPreinscriptionOpen } from '../courses/course.rules.js';
import type { EnrollmentQuery } from './enrollment-query.js';

const enrollmentInclude = {
  course: { select: { id: true, name: true, code: true, capacity: true } },
  participant: { select: { id: true, name: true, email: true } },
  participantType: { select: { id: true, name: true } },
  payment: { select: { id: true, amount: true, registeredAt: true } }
} satisfies Prisma.EnrollmentInclude;

type EnrollmentRecord = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentInclude }>;

const toMoney = (value: Prisma.Decimal | number) => Number(value);

const toEnrollmentResponse = (enrollment: EnrollmentRecord) => ({
  id: String(enrollment.id),
  status: enrollment.status,
  participantId: String(enrollment.participantId),
  participantName: enrollment.participant.name,
  participantEmail: enrollment.participant.email,
  courseId: String(enrollment.courseId),
  courseName: enrollment.course.name,
  courseCode: enrollment.course.code ?? '',
  participantTypeId: String(enrollment.participantTypeId),
  participantTypeName: enrollment.participantType.name,
  basePrice: toMoney(enrollment.basePrice),
  scholarshipPercent: toMoney(enrollment.scholarshipPercent),
  scholarshipReason: enrollment.scholarshipReason,
  scholarshipActive: enrollment.scholarshipActive,
  benefitAmount: toMoney(enrollment.benefitAmount),
  finalAmount: toMoney(enrollment.finalAmount),
  paymentRegistered: Boolean(enrollment.payment),
  paymentAmount: enrollment.payment ? toMoney(enrollment.payment.amount) : null,
  paymentRegisteredAt: enrollment.payment?.registeredAt.toISOString() ?? null,
  paymentStatus: toMoney(enrollment.finalAmount) <= 0
    ? 'NO_REQUIERE'
    : !enrollment.payment
      ? 'PENDIENTE'
      : toMoney(enrollment.payment.amount) >= toMoney(enrollment.finalAmount)
        ? 'PAGADO'
        : 'PARCIAL',
  createdAt: enrollment.createdAt.toISOString(),
  updatedAt: enrollment.updatedAt.toISOString(),
  confirmedAt: enrollment.confirmedAt?.toISOString() ?? null
});

const amountsFor = (basePrice: number, scholarshipPercent: number) =>
  calculateEnrollmentAmount(basePrice, scholarshipPercent);

export const enrollmentService = {
  async courseSummaries() {
    const [courses, counts] = await Promise.all([
      prisma.course.findMany({ select: { id: true, name: true, code: true, status: true, capacity: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      prisma.enrollment.groupBy({ by: ['courseId', 'status'], _count: { _all: true } })
    ]);
    const totals = new Map(counts.map(item => [`${item.courseId}/${item.status}`, item._count._all]));
    return courses.map(course => ({ ...course, id: String(course.id), code: course.code ?? '',
      preenrolledCount: totals.get(`${course.id}/PREINSCRITO`) ?? 0, enrolledCount: totals.get(`${course.id}/INSCRITO`) ?? 0 }));
  },
  async detail(id: number) {
    const enrollment = await prisma.enrollment.findUnique({ where: { id }, include: enrollmentInclude });
    if (!enrollment) throw new HttpError(404, 'Inscripción no encontrada.');
    return toEnrollmentResponse(enrollment);
  },
  async listPage(query: EnrollmentQuery) {
    const course = await prisma.course.findUnique({ where: { id: query.courseId }, select: { id: true } });
    if (!course) throw new HttpError(404, 'Curso no encontrado.');
    const where: Prisma.EnrollmentWhereInput = { courseId: query.courseId, status: query.status,
      ...(query.search ? { OR: [
        { participant: { name: { contains: query.search, mode: 'insensitive' as const } } },
        { participant: { email: { contains: query.search, mode: 'insensitive' as const } } }
      ] } : {}) };
    return prisma.$transaction(async tx => {
      const total = await tx.enrollment.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / 20));
      const page = Math.min(query.page, totalPages);
      const rows = await tx.enrollment.findMany({ where, include: enrollmentInclude,
        orderBy: query.status === 'INSCRITO' ? [{ confirmedAt: 'desc' }, { id: 'desc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20, take: 20 });
      return { items: rows.map(toEnrollmentResponse), total, page, pageSize: 20, totalPages };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  },
  async list() {
    const enrollments = await prisma.enrollment.findMany({
      include: enrollmentInclude,
      orderBy: { createdAt: 'desc' }
    });

    return enrollments.map(toEnrollmentResponse);
  },

  async preenroll(courseId: number, user: RequestUser) {
    const participantTypeId = user.participantTypeId;
    if (!participantTypeId) {
      throw new HttpError(400, 'El participante no tiene un tipo asignado.');
    }

    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM cursos WHERE id = ${courseId} FOR UPDATE`;

      const course = await tx.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          status: true,
          capacity: true,
          preinscriptionStart: true,
          preinscriptionEnd: true
        }
      });

      if (!course || course.status !== 'PUBLISHED') {
        throw new HttpError(404, 'El curso no esta disponible.');
      }

      if (!isPreinscriptionOpen(course.preinscriptionStart, course.preinscriptionEnd)) {
        throw new HttpError(400, 'El periodo de preinscripcion ha finalizado.');
      }

      if (!course.capacity || course.capacity <= 0) {
        throw new HttpError(400, 'No existen cupos disponibles para este curso.');
      }

      const occupied = await tx.enrollment.count({ where: { courseId } });
      if (occupied >= course.capacity) {
        throw new HttpError(400, 'No existen cupos disponibles para este curso.');
      }

      const existing = await tx.enrollment.findUnique({
        where: {
          courseId_participantId: {
            courseId,
            participantId: user.id
          }
        }
      });

      if (existing) {
        throw new HttpError(409, 'Ya estas preinscrito en este curso.');
      }

      const price = await tx.coursePrice.findUnique({
        where: {
          courseId_participantTypeId: {
            courseId,
            participantTypeId
          }
        }
      });

      if (!price) {
        throw new HttpError(400, 'No hay un precio configurado para su tipo de participante.');
      }

      const basePrice = toMoney(price.basePrice);
      const { benefitAmount, finalAmount } = amountsFor(basePrice, 0);

      try {
        const enrollment = await tx.enrollment.create({
          data: {
            courseId,
            participantId: user.id,
            participantTypeId,
            status: 'PREINSCRITO',
            basePrice,
            scholarshipPercent: 0,
            benefitAmount,
            finalAmount
          },
          include: enrollmentInclude
        });

        return toEnrollmentResponse(enrollment);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new HttpError(409, 'Ya estas preinscrito en este curso.');
        }

        throw error;
      }
    });
  },

  async assignScholarship(id: number, scholarshipPercent: number, scholarshipReason: string) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: enrollmentInclude
    });

    if (!enrollment) {
      throw new HttpError(404, 'Inscripcion no encontrada.');
    }
    if (enrollment.scholarshipActive) throw new HttpError(409, 'Ya existe una beca activa para este participante y curso. Desactívala antes de asignar otra.');

    const { benefitAmount, finalAmount } = amountsFor(toMoney(enrollment.basePrice), scholarshipPercent);

    const updated = await prisma.enrollment.update({
      where: { id },
      data: {
        scholarshipPercent,
        scholarshipReason,
        scholarshipActive: true,
        benefitAmount,
        finalAmount
      },
      include: enrollmentInclude
    });

    return toEnrollmentResponse(updated);
  },

  async deactivateScholarship(id: number) {
    const enrollment = await prisma.enrollment.findUnique({ where: { id }, include: enrollmentInclude });
    if (!enrollment) throw new HttpError(404, 'Inscripción no encontrada.');
    if (!enrollment.scholarshipActive) throw new HttpError(400, 'La inscripción no tiene una beca activa.');
    const { benefitAmount, finalAmount } = amountsFor(toMoney(enrollment.basePrice), 0);
    const updated = await prisma.enrollment.update({ where: { id }, data: { scholarshipActive: false, benefitAmount, finalAmount }, include: enrollmentInclude });
    return toEnrollmentResponse(updated);
  },

  async registerPayment(id: number, amount?: number) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: enrollmentInclude
    });

    if (!enrollment) {
      throw new HttpError(404, 'Inscripcion no encontrada.');
    }

    const paymentAmount = amount ?? toMoney(enrollment.finalAmount);

    const payment = await prisma.payment.upsert({
      where: { enrollmentId: id },
      create: { enrollmentId: id, amount: paymentAmount },
      update: { amount: paymentAmount, registeredAt: new Date() }
    });

    const updated = await prisma.enrollment.findUniqueOrThrow({
      where: { id },
      include: enrollmentInclude
    });

    return {
      ...toEnrollmentResponse(updated),
      paymentAmount: toMoney(payment.amount)
    };
  },

  async confirm(id: number) {
    return prisma.$transaction(async tx => {
      const enrollment = await tx.enrollment.findUnique({
        where: { id },
        include: enrollmentInclude
      });

      if (!enrollment) {
        throw new HttpError(404, 'Inscripcion no encontrada.');
      }

      if (enrollment.status !== 'PREINSCRITO') {
        throw new HttpError(400, 'El participante no se encuentra preinscrito.');
      }

      await tx.$queryRaw`SELECT id FROM cursos WHERE id = ${enrollment.courseId} FOR UPDATE`;

      const capacity = enrollment.course.capacity ?? 0;
      const inscribed = await tx.enrollment.count({
        where: { courseId: enrollment.courseId, status: 'INSCRITO' }
      });

      if (capacity <= 0 || inscribed >= capacity) {
        throw new HttpError(400, 'No existen cupos disponibles.');
      }

      const { finalAmount } = amountsFor(
        toMoney(enrollment.basePrice),
        enrollment.scholarshipActive ? toMoney(enrollment.scholarshipPercent) : 0
      );

      if (finalAmount !== toMoney(enrollment.finalAmount)) {
        throw new HttpError(400, 'El importe no esta calculado correctamente.');
      }

      if (finalAmount > 0 && !enrollment.payment) {
        throw new HttpError(400, 'No se puede confirmar la inscripcion porque el pago correspondiente no ha sido registrado.');
      }

      if (finalAmount > 0 && toMoney(enrollment.payment!.amount) < finalAmount) {
        throw new HttpError(400, 'No se puede confirmar la inscripcion porque el pago es inferior al monto final.');
      }

      const updated = await tx.enrollment.update({
        where: { id },
        data: { status: 'INSCRITO', confirmedAt: new Date() },
        include: enrollmentInclude
      });

      return toEnrollmentResponse(updated);
    });
  }
};
