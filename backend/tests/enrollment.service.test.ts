import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateEnrollmentAmount } from '../src/shared/enrollment-amount.js';

const {
  queryRaw,
  transaction,
  courseFindUnique,
  enrollmentFindUnique,
  enrollmentCount,
  enrollmentCreate,
  enrollmentUpdate,
  coursePriceFindUnique,
  paymentUpsert
} = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  courseFindUnique: vi.fn(),
  enrollmentFindUnique: vi.fn(),
  enrollmentCount: vi.fn(),
  enrollmentCreate: vi.fn(),
  enrollmentUpdate: vi.fn(),
  coursePriceFindUnique: vi.fn(),
  paymentUpsert: vi.fn()
}));

vi.mock('../src/config/prisma.js', () => ({
  prisma: {
    $queryRaw: queryRaw,
    $transaction: transaction,
    course: { findUnique: courseFindUnique },
    enrollment: {
      findUnique: enrollmentFindUnique,
      count: enrollmentCount,
      create: enrollmentCreate,
      update: enrollmentUpdate
    },
    coursePrice: { findUnique: coursePriceFindUnique },
    payment: { upsert: paymentUpsert }
  }
}));

import { enrollmentService } from '../src/modules/enrollments/enrollment.service.js';

const participant = {
  id: 2,
  name: 'Luis Estudiante',
  email: 'luis@eva.local',
  role: 'PARTICIPANT' as const,
  participantTypeId: 1
};

const includeRecord = {
  id: 10,
  courseId: 7,
  participantId: 2,
  participantTypeId: 1,
  status: 'PREINSCRITO',
  basePrice: 500,
  scholarshipPercent: 0,
  benefitAmount: 0,
  finalAmount: 500,
  createdAt: new Date('2026-10-03T12:00:00.000Z'),
  updatedAt: new Date('2026-10-03T12:00:00.000Z'),
  course: { id: 7, name: 'PostgreSQL Intermedio', code: 'INF-PG-201', capacity: 20 },
  participant: { id: 2, name: 'Luis Estudiante', email: 'luis@eva.local' },
  participantType: { id: 1, name: 'Estudiante' },
  payment: null
};

const tx = {
  paymentMovement: { findUnique: async () => null, create: async () => ({}) },
  $queryRaw: queryRaw,
  course: { findUnique: courseFindUnique },
  enrollment: {
    findUnique: enrollmentFindUnique,
    findUniqueOrThrow: async () => ({ ...await enrollmentFindUnique(), payment: await paymentUpsert.mock.results.at(-1)?.value }),
    count: enrollmentCount,
    create: enrollmentCreate,
    update: enrollmentUpdate
  },
  coursePrice: { findUnique: coursePriceFindUnique },
  payment: { upsert: paymentUpsert }
};

describe('calculo economico', () => {
  it('calcula beca parcial, total y nunca un monto negativo', () => {
    expect(calculateEnrollmentAmount(500, 30)).toEqual({ benefitAmount: 150, finalAmount: 350 });
    expect(calculateEnrollmentAmount(800, 25)).toEqual({ benefitAmount: 200, finalAmount: 600 });
    expect(calculateEnrollmentAmount(500, 100)).toEqual({ benefitAmount: 500, finalAmount: 0 });
    expect(calculateEnrollmentAmount(100, 150)).toEqual({ benefitAmount: 100, finalAmount: 0 });
  });
});

describe('preinscripcion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    courseFindUnique.mockResolvedValue({
      id: 7,
      status: 'PUBLISHED',
      capacity: 20,
      preinscriptionStart: new Date('2026-09-01'),
      preinscriptionEnd: new Date('2026-12-31')
    });
    enrollmentCount.mockResolvedValue(0);
    enrollmentFindUnique.mockResolvedValue(null);
    coursePriceFindUnique.mockResolvedValue({ basePrice: 500 });
    enrollmentCreate.mockResolvedValue(includeRecord);
  });

  it('registra una preinscripcion correcta', async () => {
    const result = await enrollmentService.preenroll(7, participant);

    expect(result).toMatchObject({ status: 'PREINSCRITO', basePrice: 500, finalAmount: 500 });
    expect(enrollmentCreate).toHaveBeenCalled();
  });

  it('rechaza un intento duplicado', async () => {
    enrollmentFindUnique.mockResolvedValue(includeRecord);

    await expect(enrollmentService.preenroll(7, participant)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Ya estas preinscrito en este curso.'
    });
  });

  it('rechaza un curso sin cupos', async () => {
    enrollmentCount.mockResolvedValue(20);

    await expect(enrollmentService.preenroll(7, participant)).rejects.toMatchObject({
      message: 'No existen cupos disponibles para este curso.'
    });
  });

  it('rechaza cuando el periodo esta cerrado', async () => {
    courseFindUnique.mockResolvedValue({
      id: 7,
      status: 'PUBLISHED',
      capacity: 20,
      preinscriptionStart: new Date('2025-01-01'),
      preinscriptionEnd: new Date('2025-02-01')
    });

    await expect(enrollmentService.preenroll(7, participant)).rejects.toMatchObject({
      message: 'El periodo de preinscripcion ha finalizado.'
    });
  });
});

describe('confirmacion de inscripcion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    enrollmentCount.mockResolvedValue(0);
    enrollmentUpdate.mockImplementation(async ({ data }: { data: { status?: string; confirmedAt?: Date; scholarshipActive?: boolean; benefitAmount?: number; finalAmount?: number; scholarshipPercent?: number; scholarshipReason?: string } }) => ({
      ...includeRecord,
      ...data,
      events: [],
      payment: includeRecord.payment
    }));
  });

  it('confirma preinscrito con pago valido', async () => {
    enrollmentFindUnique.mockResolvedValue({
      ...includeRecord,
      payment: { id: 1, amount: 500, registeredAt: new Date() }
    });

    const result = await enrollmentService.confirm(10);
    expect(result.status).toBe('INSCRITO');
    expect(result.confirmedAt).toBeTruthy();
    expect(enrollmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'INSCRITO', confirmedAt: expect.any(Date) }) }));
  });

  it('rechaza a una persona que no esta preinscrita', async () => {
    enrollmentFindUnique.mockResolvedValue({ ...includeRecord, status: 'INSCRITO' });

    await expect(enrollmentService.confirm(10)).rejects.toMatchObject({
      message: 'El participante no se encuentra preinscrito.'
    });
  });

  it('rechaza monto mayor a 0 sin pago', async () => {
    enrollmentFindUnique.mockResolvedValue(includeRecord);

    await expect(enrollmentService.confirm(10)).rejects.toMatchObject({
      message: 'No se puede confirmar la inscripcion porque el pago correspondiente no ha sido registrado.'
    });
  });

  it('rechaza confirmar cuando el pago registrado es inferior al monto final', async () => {
    enrollmentFindUnique.mockResolvedValue({
      ...includeRecord,
      payment: { id: 1, amount: 499, registeredAt: new Date('2026-10-08T12:00:00.000Z') }
    });

    await expect(enrollmentService.confirm(10)).rejects.toMatchObject({
      statusCode: 400,
      message: 'No se puede confirmar la inscripcion porque el pago es inferior al monto final.'
    });
    expect(enrollmentUpdate).not.toHaveBeenCalled();
  });

  it('permite confirmar beca del 100 % sin pago', async () => {
    enrollmentFindUnique.mockResolvedValue({
      ...includeRecord,
      scholarshipPercent: 100,
      scholarshipActive: true,
      benefitAmount: 500,
      finalAmount: 0,
      payment: null
    });

    const result = await enrollmentService.confirm(10);
    expect(result.status).toBe('INSCRITO');
  });

  it('rechaza la confirmacion sin cupos', async () => {
    enrollmentFindUnique.mockResolvedValue({
      ...includeRecord,
      payment: { id: 1, amount: 500, registeredAt: new Date() }
    });
    enrollmentCount.mockResolvedValue(20);

    await expect(enrollmentService.confirm(10)).rejects.toMatchObject({
      message: 'No existen cupos disponibles.'
    });
  });

  it('confirma con beca desactivada y pago del precio base sin aplicar el porcentaje histórico', async () => {
    enrollmentFindUnique.mockResolvedValue({ ...includeRecord, scholarshipActive: false, scholarshipPercent: 50,
      payment: { id: 1, amount: 500, registeredAt: new Date() } });
    await expect(enrollmentService.confirm(10)).resolves.toMatchObject({ status: 'INSCRITO' });
  });

  it('desactiva la beca, conserva su historial y restaura el importe base', async () => {
    enrollmentFindUnique.mockResolvedValue({ ...includeRecord, scholarshipPercent: 50, scholarshipReason: 'Apoyo socioeconómico', scholarshipActive: true, benefitAmount: 250, finalAmount: 250 });
    enrollmentUpdate.mockResolvedValue({ ...includeRecord, scholarshipPercent: 50, scholarshipReason: 'Apoyo socioeconómico', scholarshipActive: false, benefitAmount: 0, finalAmount: 500 });
    const result = await enrollmentService.deactivateScholarship(10);
    expect(result).toMatchObject({ scholarshipPercent: 50, scholarshipReason: 'Apoyo socioeconómico', scholarshipActive: false, benefitAmount: 0, finalAmount: 500 });
    expect(enrollmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { scholarshipActive: false, benefitAmount: 0, finalAmount: 500 } }));
  });

  it('rechaza un abono de importe cero', async () => {
    enrollmentFindUnique.mockResolvedValue({ ...includeRecord, status: 'INSCRITO',
      payment: { id: 1, amount: 500, registeredAt: new Date() } });
    await expect(enrollmentService.registerPayment(10, 0)).rejects.toMatchObject({ statusCode: 400 });
    expect(paymentUpsert).not.toHaveBeenCalled();
  });

  it('rechaza quitar una beca de un inscrito si su pago no cubre el nuevo importe', async () => {
    enrollmentFindUnique.mockResolvedValue({ ...includeRecord, status: 'INSCRITO', scholarshipActive: true,
      scholarshipPercent: 100, finalAmount: 0 });
    await expect(enrollmentService.deactivateScholarship(10)).rejects.toMatchObject({ statusCode: 409 });
    expect(enrollmentUpdate).not.toHaveBeenCalled();
  });

  it('registra un abono de un inscrito si sigue cubriendo el monto final', async () => {
    enrollmentFindUnique.mockResolvedValue({ ...includeRecord, status: 'INSCRITO' });
    paymentUpsert.mockResolvedValue({ id: 1, amount: 550, registeredAt: new Date() });
    await expect(enrollmentService.registerPayment(10, 550)).resolves.toMatchObject({ status: 'INSCRITO', paymentStatus: 'PAGADO', paymentAmount: 550 });
    expect(paymentUpsert).toHaveBeenCalledWith(expect.objectContaining({update:expect.objectContaining({amount:550})}));
  });

  it('relee la inscripción después de bloquearla y rechaza una segunda confirmación', async () => {
    enrollmentFindUnique.mockResolvedValueOnce({ courseId: 7 }).mockResolvedValueOnce({ ...includeRecord, status: 'INSCRITO' });
    await expect(enrollmentService.confirm(10)).rejects.toMatchObject({ statusCode: 400 });
    expect(enrollmentUpdate).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('usa el importe actualizado dentro del bloqueo para confirmar', async () => {
    enrollmentFindUnique.mockResolvedValueOnce({ courseId: 7 }).mockResolvedValueOnce({ ...includeRecord,
      payment: { id: 1, amount: 250, registeredAt: new Date() } });
    await expect(enrollmentService.confirm(10)).rejects.toMatchObject({ statusCode: 400 });
    expect(enrollmentUpdate).not.toHaveBeenCalled();
  });
});
