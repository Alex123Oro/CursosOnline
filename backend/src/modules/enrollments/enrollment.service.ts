import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { RequestUser } from '../../shared/auth.js';
import { calculateEnrollmentAmount } from '../../shared/enrollment-amount.js';
import { HttpError } from '../../shared/http-error.js';
import { isPreinscriptionOpen } from '../courses/course.rules.js';
import type { EnrollmentQuery } from './enrollment-query.js';
import { randomUUID } from 'node:crypto';
import { activeEnrollmentStatuses, expireDueReservations } from './enrollment-lifecycle.js';

const enrollmentInclude = {
  course: { select: { id: true, name: true, code: true, capacity: true } },
  participant: { select: { id: true, name: true, email: true } },
  participantType: { select: { id: true, name: true } },
  payment: { select: { id: true, amount: true, registeredAt: true } },
  paymentMovements: { include: { recordedBy: { select: { name: true } } }, orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }] },
  events: { include: { recordedBy: { select: { name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }
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
    : !enrollment.payment || Number(enrollment.payment.amount) <= 0
      ? 'PENDIENTE'
      : toMoney(enrollment.payment.amount) >= toMoney(enrollment.finalAmount)
        ? 'PAGADO'
        : 'PARCIAL',
  createdAt: enrollment.createdAt.toISOString(),
  updatedAt: enrollment.updatedAt.toISOString(),
  confirmedAt: enrollment.confirmedAt?.toISOString() ?? null,
  closedAt: enrollment.closedAt?.toISOString() ?? null,
  closureReason: enrollment.closureReason ?? null,
  paymentMovements: (enrollment.paymentMovements ?? []).map(m => ({ id: String(m.id), kind: m.kind, amount: Number(m.amount), reason: m.reason,
    reference: m.reference, recordedBy: m.recordedBy?.name ?? 'Registro anterior', registeredAt: m.registeredAt.toISOString() })),
  history: (enrollment.events ?? []).map(e => ({ id: String(e.id), status: e.status, reason: e.reason,
    recordedBy: e.recordedBy?.name ?? 'Sistema', createdAt: e.createdAt.toISOString() }))
});

const amountsFor = (basePrice: number, scholarshipPercent: number) =>
  calculateEnrollmentAmount(basePrice, scholarshipPercent);

// Every financial write and confirmation uses the same lock order as preenrollment:
// course -> enrollment. Values are read again only after acquiring both locks.
async function withLockedEnrollment<T>(id: number,
  write: (tx: Prisma.TransactionClient, enrollment: EnrollmentRecord) => Promise<T>) {
  const initial = await prisma.enrollment.findUnique({ where: { id }, select: { courseId: true } });
  if (!initial) throw new HttpError(404, 'Inscripcion no encontrada.');
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM cursos WHERE id = ${initial.courseId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM inscripciones WHERE id = ${id} AND curso_id = ${initial.courseId} FOR UPDATE`;
    const enrollment = await tx.enrollment.findUnique({ where: { id }, include: enrollmentInclude });
    if (!enrollment) throw new HttpError(404, 'Inscripcion no encontrada.');
    if (enrollment.courseId !== initial.courseId) throw new HttpError(409, 'La inscripción cambió. Recarga sus datos.');
    return write(tx, enrollment);
  });
}

function requireConfirmedFunding(enrollment: EnrollmentRecord, finalAmount: number,
  paymentAmount = enrollment.payment ? toMoney(enrollment.payment.amount) : 0) {
  if (enrollment.status === 'INSCRITO' && paymentAmount < finalAmount) {
    throw new HttpError(409, 'La inscripción está confirmada. El pago debe cubrir el monto final para guardar este cambio.');
  }
}

export const enrollmentService = {
  async mine(user: RequestUser) {
    return (await prisma.enrollment.findMany({ where: { participantId: user.id }, include: enrollmentInclude, orderBy: { createdAt: 'desc' } })).map(toEnrollmentResponse);
  },
  async expire() { return { expired: await expireDueReservations() }; },
  async close(id: number, status: 'CANCELADO' | 'RECHAZADO', reason: string, actor: RequestUser) {
    return withLockedEnrollment(id, async (tx, enrollment) => {
      if (actor.role !== 'ADMIN' && (actor.role !== 'PARTICIPANT' || enrollment.participantId !== actor.id || status !== 'CANCELADO')) throw new HttpError(403, 'No tienes permisos para cambiar esta preinscripción.');
      if (enrollment.status !== 'PREINSCRITO') throw new HttpError(409, 'Solo se pueden cerrar preinscripciones activas.');
      if (Number(enrollment.payment?.amount ?? 0) > 0) throw new HttpError(409, 'La reserva tiene pagos. Administración debe gestionar la devolución antes de liberar el cupo.');
      return toEnrollmentResponse(await tx.enrollment.update({ where: { id }, data: { status, closedAt: new Date(), closureReason: reason,
        events: { create: { status, reason, recordedById: actor.id } } }, include: enrollmentInclude }));
    });
  },
  async courseSummaries() {
    const [courses, counts] = await Promise.all([
      prisma.course.findMany({ select: { id: true, name: true, code: true, status: true, capacity: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      prisma.enrollment.groupBy({ by: ['courseId', 'status'], _count: { _all: true } })
    ]);
    const totals = new Map(counts.map(item => [`${item.courseId}/${item.status}`, item._count._all]));
    return courses.map(course => ({ ...course, id: String(course.id), code: course.code ?? '',
      preenrolledCount: totals.get(`${course.id}/PREINSCRITO`) ?? 0, enrolledCount: totals.get(`${course.id}/INSCRITO`) ?? 0,
      closedCounts: Object.fromEntries(['CANCELADO', 'RECHAZADO', 'CADUCADO'].map(status => [status, totals.get(`${course.id}/${status}`) ?? 0])) }));
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

      const occupied = await tx.enrollment.count({ where: { courseId, status: { in: [...activeEnrollmentStatuses] } } });
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

      if (existing && !['CANCELADO', 'CADUCADO'].includes(existing.status)) {
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
        const data = {
            courseId,
            participantId: user.id,
            participantTypeId,
            status: 'PREINSCRITO' as const,
            basePrice,
            scholarshipPercent: 0,
            benefitAmount,
            finalAmount, scholarshipActive: false, scholarshipReason: null, closedAt: null, closureReason: null,
            events: { create: { status: 'PREINSCRITO' as const, reason: existing ? 'El participante volvió a solicitar una reserva.' : 'Preinscripción del participante.', recordedById: user.id } }
        };
        const enrollment = existing
          ? await tx.enrollment.update({ where: { id: existing.id }, data, include: enrollmentInclude })
          : await tx.enrollment.create({ data, include: enrollmentInclude });

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
    return withLockedEnrollment(id, async (tx, enrollment) => {
      if (!activeEnrollmentStatuses.includes(enrollment.status as 'PREINSCRITO' | 'INSCRITO')) throw new HttpError(409, 'La inscripción está cerrada.');
      if (enrollment.scholarshipActive) throw new HttpError(409, 'Ya existe una beca activa para este participante y curso. Desactívala antes de asignar otra.');

      const { benefitAmount, finalAmount } = amountsFor(toMoney(enrollment.basePrice), scholarshipPercent);
      requireConfirmedFunding(enrollment, finalAmount);

      const updated = await tx.enrollment.update({
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
    });
  },

  async deactivateScholarship(id: number) {
    return withLockedEnrollment(id, async (tx, enrollment) => {
      if (!activeEnrollmentStatuses.includes(enrollment.status as 'PREINSCRITO' | 'INSCRITO')) throw new HttpError(409, 'La inscripción está cerrada.');
      if (!enrollment.scholarshipActive) throw new HttpError(400, 'La inscripción no tiene una beca activa.');
      const { benefitAmount, finalAmount } = amountsFor(toMoney(enrollment.basePrice), 0);
      requireConfirmedFunding(enrollment, finalAmount);
      const updated = await tx.enrollment.update({ where: { id }, data: { scholarshipActive: false, benefitAmount, finalAmount }, include: enrollmentInclude });
      return toEnrollmentResponse(updated);
    });
  },

  async registerPayment(id: number, amount?: number, actorId?: number, requestId: string = randomUUID(), reason = 'Abono registrado por administración', reference?: string) {
    return this.movement(id, { kind: 'ABONO', amount, reason, reference, requestId }, actorId);
  },

  async movement(id: number, input: { kind: 'ABONO' | 'DEVOLUCION' | 'AJUSTE'; amount?: number | undefined; reason: string; reference?: string | undefined; requestId: string }, actorId?: number) {
    return withLockedEnrollment(id, async (tx, enrollment) => {
      if (!activeEnrollmentStatuses.includes(enrollment.status as 'PREINSCRITO' | 'INSCRITO')) throw new HttpError(409, 'No se pueden registrar movimientos en una inscripción cerrada.');
      const currentAmount = Number(enrollment.payment?.amount ?? 0);
      const existing = await tx.paymentMovement.findUnique({ where: { requestId: input.requestId } });
      if (existing) {
        const requestedDelta = input.kind === 'DEVOLUCION' ? -Number(input.amount) : input.amount;
        if (existing.enrollmentId !== id || existing.kind !== input.kind || (input.amount !== undefined && Number(existing.amount) !== requestedDelta) || existing.reason !== input.reason || (existing.reference ?? '') !== (input.reference ?? '') || existing.recordedById !== (actorId ?? null)) throw new HttpError(409, 'La solicitud de pago ya fue utilizada con otros datos.');
        return toEnrollmentResponse(enrollment);
      }
      const value = input.amount ?? Math.max(0, Number(enrollment.finalAmount) - currentAmount);
      if (!Number.isFinite(value) || value === 0 || Math.abs(value) > 99999999.99 || (input.kind !== 'AJUSTE' && value < 0) || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw new HttpError(400, 'Ingresa un importe válido con hasta dos decimales.');
      const delta = input.kind === 'DEVOLUCION' ? -value : value;
      const paymentAmount = Math.round((currentAmount + delta) * 100) / 100;
      if (paymentAmount < 0) throw new HttpError(400, 'La devolución supera el total registrado.');
      if (paymentAmount > 99999999.99) throw new HttpError(400, 'El saldo supera el importe permitido.');
      requireConfirmedFunding(enrollment, toMoney(enrollment.finalAmount), paymentAmount);
      await tx.paymentMovement.create({ data: { enrollmentId: id, kind: input.kind, amount: delta, reason: input.reason,
        reference: input.reference ?? null, requestId: input.requestId, recordedById: actorId ?? null } });
      await tx.payment.upsert({
        where: { enrollmentId: id },
        create: { enrollmentId: id, amount: paymentAmount },
        update: { amount: paymentAmount, registeredAt: new Date() }
      });

      return toEnrollmentResponse(await tx.enrollment.findUniqueOrThrow({ where: { id }, include: enrollmentInclude }));
    });
  },

  async confirm(id: number, actorId?: number) {
    return withLockedEnrollment(id, async (tx, enrollment) => {
      if (enrollment.status !== 'PREINSCRITO') {
        throw new HttpError(400, 'El participante no se encuentra preinscrito.');
      }

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
        data: { status: 'INSCRITO', confirmedAt: new Date(), events: { create: { status: 'INSCRITO', reason: 'Confirmación administrativa con financiamiento completo.', recordedById: actorId ?? null } } },
        include: enrollmentInclude
      });

      return toEnrollmentResponse(updated);
    });
  }
};
