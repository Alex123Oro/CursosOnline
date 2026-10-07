import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ course: { findUnique: vi.fn() }, courseSession: { createManyAndReturn: vi.fn(), findMany: vi.fn() } }));
vi.mock('../src/config/prisma.js', () => ({ prisma: mocks }));
import { recurrenceInputSchema, recurrenceDates } from '../src/modules/course-sessions/course-session.rules.js';
import { courseSessionService } from '../src/modules/course-sessions/course-session.service.js';
const input = { startDate: '2026-10-12', endDate: '2026-10-21', weekdays: [1, 3], startTime: '18:00', durationMinutes: 90 };
const user = { id: 8, name: 'Carla', email: 'test', role: 'ADMIN' as const, participantTypeId: null };
const course = { id: 2, code: 'PG', name: 'PostgreSQL', instructor: 'Carla', instructorId: 8, status: 'PUBLISHED', startDate: new Date('2026-10-12'), endDate: new Date('2026-10-20') };
describe('weekly session scheduling', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.course.findUnique.mockResolvedValue(course); mocks.courseSession.createManyAndReturn.mockResolvedValue([{ id: 4 }]); mocks.courseSession.findMany.mockResolvedValue([]); });
  it('includes both boundaries and selected weekdays in chronological order', () => {
    expect(recurrenceDates(recurrenceInputSchema.parse(input))).toEqual(['2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21']);
  });
  it('generates Sundays and crosses month and leap-year boundaries', () => {
    expect(recurrenceDates({ ...input, startDate: '2028-02-27', endDate: '2028-03-05', weekdays: [0, 2] })).toEqual(['2028-02-27', '2028-02-29', '2028-03-05']);
  });
  it.each([
    { startDate: '2026-02-30' }, { endDate: '2026-10-01' }, { weekdays: [] }, { weekdays: [7] },
    { weekdays: [1, 1] }, { durationMinutes: 0 }, { startTime: '23:00', durationMinutes: 60 },
    { endDate: '2028-10-12' }, { startDate: '2026-10-12', endDate: '2026-10-12', weekdays: [2] }
  ])('rejects invalid or empty schedules %j', change => { expect(recurrenceInputSchema.safeParse({ ...input, ...change }).success).toBe(false); });
  it('atomically creates the batch, skips exact duplicates and returns authoritative counts', async () => {
    const result = await courseSessionService.schedule(2, input, user);
    expect(result).toMatchObject({ createdCount: 1, skippedCount: 3, sessions: [] });
    expect(mocks.courseSession.createManyAndReturn).toHaveBeenCalledWith({ skipDuplicates: true, data: ['2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21'].map(date => ({ courseId: 2, date: new Date(date), startTime: '18:00', durationMinutes: 90 })) });
  });
  it.each([
    { status: 'DRAFT', statusCode: 400 }
  ])('authorizes the whole batch before writing %j', async ({ statusCode, ...change }) => {
    mocks.course.findUnique.mockResolvedValue({ ...course, ...change });
    await expect(courseSessionService.schedule(2, input, user)).rejects.toMatchObject({ statusCode });
    expect(mocks.courseSession.createManyAndReturn).not.toHaveBeenCalled();
  });
  it('propagates batch failure instead of reporting partial success', async () => {
    mocks.courseSession.createManyAndReturn.mockRejectedValue(new Error('Database unavailable'));
    await expect(courseSessionService.schedule(2, input, user)).rejects.toThrow('Database unavailable');
    expect(mocks.courseSession.findMany).not.toHaveBeenCalled();
  });
});
