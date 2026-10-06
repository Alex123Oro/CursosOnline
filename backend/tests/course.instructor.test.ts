import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, course: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() } }));
vi.mock('../src/config/prisma.js', () => ({ prisma: mocks }));
import { courseService } from '../src/modules/courses/course.service.js';
import { courseInputSchema } from '../src/modules/courses/course.rules.js';
const input = { name: 'Curso prueba', content: 'Contenido de curso prueba', durationHours: 10, instructor: 'Nombre anterior', schedule: 'Lunes 19:00', instructorId: '8' };
const record = { id: 1, ...input, instructorId: 8, status: 'DRAFT', prices: [], _count: { enrollments: 0 }, createdAt: new Date(), updatedAt: new Date(), startDate: null, endDate: null, preinscriptionStart: null, preinscriptionEnd: null, capacity: null };
describe('course instructor assignment', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.user.findUnique.mockResolvedValue({ id: 8, name: 'Carla', role: 'INSTRUCTOR' }); mocks.course.create.mockResolvedValue({ ...record, instructor: 'Carla' }); mocks.course.update.mockResolvedValue({ ...record, instructor: 'Carla' }); mocks.course.findUnique.mockResolvedValue({ status: 'DRAFT', instructorId: 8 }); });
  it('links an instructor and uses their name on creation', async () => {
    const result = await courseService.create(courseInputSchema.parse(input));
    expect(result).toMatchObject({ instructorId: '8', instructor: 'Carla' });
    expect(mocks.course.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ instructorId: 8, instructor: 'Carla' }) }));
  });
  it('rejects a participant as instructor', async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 8, name: 'Carla', role: 'PARTICIPANT' });
    await expect(courseService.create(courseInputSchema.parse(input))).rejects.toMatchObject({ statusCode: 400 });
  });
  it('rejects an instructor that does not exist', async () => {
    mocks.user.findUnique.mockResolvedValue(null);
    await expect(courseService.create(courseInputSchema.parse(input))).rejects.toMatchObject({ statusCode: 400 });
  });
  it('preserves assignment and its name when an older client omits instructorId', async () => {
    const { instructorId, ...legacy } = input;
    await courseService.update(1, courseInputSchema.parse(legacy));
    expect(mocks.course.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ instructorId: 8, instructor: 'Carla' }) }));
  });
  it('allows explicitly unlinking an instructor while keeping a legacy name', async () => {
    await courseService.update(1, courseInputSchema.parse({ ...input, instructorId: null }));
    expect(mocks.course.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ instructorId: null, instructor: 'Nombre anterior' }) }));
  });
  it('preserves approval criteria when editing only ordinary course fields', async () => {
    await courseService.update(1, courseInputSchema.parse(input));
    expect(mocks.course.update.mock.calls[0][0].data).not.toHaveProperty('approvalCriteria');
  });
});
