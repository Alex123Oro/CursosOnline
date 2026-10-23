import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  courseResult: { updateMany: vi.fn() },
  $transaction: vi.fn(), $queryRaw: vi.fn(), courseInstructor: { findUnique: vi.fn() },
  course: { findUnique: vi.fn() },
  courseSession: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() }
}));
vi.mock('../src/config/prisma.js', () => ({ prisma: mocks }));
import { recurrenceInputSchema, recurrenceDates } from '../src/modules/course-sessions/course-session.rules.js';
import { courseSessionService } from '../src/modules/course-sessions/course-session.service.js';
const input = { startDate: '2026-10-12', endDate: '2026-10-21', weekdays: [1, 3], startTime: '18:00', durationMinutes: 90 };
const user = { id: 8, name: 'Carla', email: 'test', role: 'INSTRUCTOR' as const, participantTypeId: null };
const course = { id: 2, code: 'PG', name: 'PostgreSQL', instructor: 'Carla', instructorId: 8, status: 'PUBLISHED', startDate: new Date('2026-10-12'), endDate: new Date('2026-10-20') };
describe('weekly session scheduling', () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.$queryRaw.mockResolvedValue([]);
    mocks.$transaction.mockImplementation(callback => callback(mocks)); mocks.$queryRaw.mockResolvedValue([]);
    mocks.course.findUnique.mockResolvedValue(course); mocks.courseSession.findMany.mockResolvedValue([]);
    mocks.courseSession.findFirst.mockImplementation(({ where }) => where.date && where.date.toISOString().slice(0, 10) !== '2026-10-12' ? { id: 99 } : null);
    mocks.courseSession.create.mockResolvedValue({ id: 4, courseId: 2, sessionNumber: 1, date: new Date('2026-10-12'), startTime: '18:00', durationMinutes: 90, createdAt: new Date(), updatedAt: new Date(), _count: { attendance: 0 }, instructorAttendance: [] });
  });
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
  it('creates missing dates in one transaction and skips exact duplicates', async () => {
    const result = await courseSessionService.schedule(2, input, user);
    expect(result).toMatchObject({ createdCount: 1, skippedCount: 3, sessions: [] });
    expect(mocks.courseSession.create).toHaveBeenCalledTimes(1);
    expect(mocks.courseSession.create).toHaveBeenCalledWith(expect.objectContaining({ data: { courseId: 2, sessionNumber: 1, date: new Date('2026-10-12'), startTime: '18:00', durationMinutes: 90 } }));
  });
  it.each([{ status: 'DRAFT', statusCode: 400 }])('authorizes the whole batch before writing %j', async ({ statusCode, ...change }) => {
    mocks.course.findUnique.mockResolvedValue({ ...course, ...change });
    await expect(courseSessionService.schedule(2, input, user)).rejects.toMatchObject({ statusCode });
    expect(mocks.courseSession.create).not.toHaveBeenCalled();
  });
  it('propagates batch failure instead of reporting partial success', async () => {
    mocks.courseSession.create.mockRejectedValue(new Error('Database unavailable'));
    await expect(courseSessionService.schedule(2, input, user)).rejects.toThrow('Database unavailable');
    expect(mocks.courseSession.findMany).not.toHaveBeenCalled();
  });
});
