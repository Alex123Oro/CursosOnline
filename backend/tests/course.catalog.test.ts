import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock('../src/config/prisma.js', () => ({
  prisma: {
    course: {
      findFirst
    }
  }
}));

import { courseService } from '../src/modules/courses/course.service.js';
import { courseController } from '../src/modules/courses/course.controller.js';

describe('course catalogue (HU-03)', () => {
  beforeEach(() => findFirst.mockReset());

  it('returns a published course by id', async () => {
    findFirst.mockResolvedValue({
      id: 7,
      code: 'INF-JS-101',
      name: 'Programación con JavaScript',
      content: 'Aprende fundamentos de JavaScript para aplicaciones web.',
      durationHours: 32,
      instructor: 'Valeria Ríos',
      schedule: 'Martes y jueves · 19:00 – 21:00',
      approvalCriteria: 'Nota mínima de 70/100 y asistencia mínima de 80%.',
      status: 'PUBLISHED',
      startDate: new Date('2026-10-06'),
      endDate: new Date('2026-11-12'),
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
      updatedAt: new Date('2026-09-20T12:00:00.000Z')
    });

    const course = await courseService.catalogById(7);

    expect(course).toMatchObject({ id: '7', code: 'INF-JS-101', status: 'PUBLISHED' });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 7, status: 'PUBLISHED' }
    }));
  });

  it('does not return a course when it is not published or does not exist', async () => {
    findFirst.mockResolvedValue(null);

    await expect(courseService.catalogById(999)).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 999, status: 'PUBLISHED' }
    }));
  });

  it('responds as not found when the public detail is unavailable', async () => {
    findFirst.mockResolvedValue(null);

    await expect(courseController.catalogDetail(
      { params: { id: '999' } } as never,
      { json: vi.fn() } as never
    )).rejects.toMatchObject({ statusCode: 404 });
  });
});
