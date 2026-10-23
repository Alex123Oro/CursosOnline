import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, update, transaction, queryRaw } = vi.hoisted(() => ({
  transaction: vi.fn(), queryRaw: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn()
}));

vi.mock('../src/config/prisma.js', () => ({
  prisma: { $transaction: transaction, user: { findUnique: async () => ({id:8,name:"Ana Lopez",role:"INSTRUCTOR"}) }, courseResult: { updateMany: async () => ({ count: 0 }) }, course: { findUnique, update } }
}));

import { courseService } from '../src/modules/courses/course.service.js';
import { courseInputSchema } from '../src/modules/courses/course.rules.js';

const input = courseInputSchema.parse({
  name: 'Curso de seguridad',
  content: 'Contenido de seguridad para el personal',
  durationHours: 12,
  instructor: 'Ana Lopez',
  schedule: 'Martes 18:00-20:00',
  approvalCriteria: 'Proyecto final',
  startDate: null,
  endDate: null
});

describe('course updates', () => {
  beforeEach(() => {
    vi.resetAllMocks(); queryRaw.mockResolvedValue([]);
    transaction.mockImplementation(callback => callback({ $queryRaw: queryRaw, user: { findUnique: async () => ({id:8,name:'Ana Lopez',role:'INSTRUCTOR'}) }, courseResult: { updateMany: async () => ({count:0}) }, course: { findUnique, update } }));
  });

  it.each(['startDate', 'endDate'] as const)('rejects removing %s from a published course', async field => {
    findUnique.mockResolvedValue({ status: 'PUBLISHED' });
    const edited = { ...input, startDate: '2026-10-01', endDate: '2026-11-01', [field]: null };

    await expect(courseService.update(7, edited)).rejects.toMatchObject({ statusCode: 400 });
    expect(update).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'PUBLISHED'])('preserves %s when saving valid data', async status => {
    findUnique.mockResolvedValue({ status, instructorId: 8, instructor: input.instructor, schedule: input.schedule,
      _count: { enrollments: 0 }, sessions: [{ date: new Date('2026-10-12'), startTime: '18:00', durationMinutes: 60 }],
      prices: [{ basePrice: 100 }] });
    const edited = status === 'DRAFT'
      ? input
      : { ...input, startDate: '2026-10-01', endDate: '2026-11-01', capacity: 20, preinscriptionStart: '2026-09-01', preinscriptionEnd: '2026-09-30' };
    update.mockResolvedValue({
      ...edited, id: 7, code: null, status,
      startDate: edited.startDate ? new Date(edited.startDate) : null,
      endDate: edited.endDate ? new Date(edited.endDate) : null,
      capacity: edited.capacity ?? null,
      preinscriptionStart: edited.preinscriptionStart ? new Date(edited.preinscriptionStart) : null,
      preinscriptionEnd: edited.preinscriptionEnd ? new Date(edited.preinscriptionEnd) : null,
      prices: [],
      _count: { enrollments: 0 },
      createdAt: new Date(), updatedAt: new Date()
    });

    await expect(courseService.update(7, edited)).resolves.toMatchObject({ status });
    const data = update.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty('status');
    expect(data.startDate).toEqual(edited.startDate ? new Date(edited.startDate) : null);
  });

  it('returns 404 for a missing course', async () => {
    findUnique.mockResolvedValue(null);
    await expect(courseService.update(999, input)).rejects.toMatchObject({ statusCode: 404 });
    expect(update).not.toHaveBeenCalled();
  });
  it('persists and returns the minimum enrollment', async () => {
    findUnique.mockResolvedValue({ id: 7, status: 'DRAFT', instructorId: null, _count: { enrollments: 0 } });
    update.mockResolvedValue({ ...input, id: 7, minimumEnrollment: 5, capacity: 20, status: 'DRAFT', code: null,
      preinscriptionStart: null, preinscriptionEnd: null, prices: [], _count: { enrollments: 0 }, createdAt: new Date(), updatedAt: new Date() });
    await expect(courseService.update(7, { ...input, minimumEnrollment: 5, capacity: 20 })).resolves.toMatchObject({ minimumEnrollment: 5 });
    expect(update.mock.calls[0]![0].data.minimumEnrollment).toBe(5);
  });
});
