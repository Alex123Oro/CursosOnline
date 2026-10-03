import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn()
}));

vi.mock('../src/config/prisma.js', () => ({
  prisma: { course: { findUnique, update } }
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
  beforeEach(() => vi.resetAllMocks());

  it.each(['startDate', 'endDate'] as const)('rejects removing %s from a published course', async field => {
    findUnique.mockResolvedValue({ status: 'PUBLISHED' });
    const edited = { ...input, startDate: '2026-10-01', endDate: '2026-11-01', [field]: null };

    await expect(courseService.update(7, edited)).rejects.toMatchObject({ statusCode: 400 });
    expect(update).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'PUBLISHED'])('preserves %s when saving valid data', async status => {
    findUnique.mockResolvedValue({ status });
    const edited = status === 'DRAFT'
      ? input
      : { ...input, startDate: '2026-10-01', endDate: '2026-11-01' };
    update.mockResolvedValue({
      ...edited, id: 7, code: null, status,
      startDate: edited.startDate ? new Date(edited.startDate) : null,
      endDate: edited.endDate ? new Date(edited.endDate) : null,
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
});
