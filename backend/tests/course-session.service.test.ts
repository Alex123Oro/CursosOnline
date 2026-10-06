import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const mocks = vi.hoisted(() => ({ course: { findUnique: vi.fn(), findMany: vi.fn() }, courseSession: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } }));
vi.mock('../src/config/prisma.js', () => ({ prisma: mocks }));
import { courseSessionService } from '../src/modules/course-sessions/course-session.service.js';

const admin = { id: 1, name: 'Admin', email: 'admin@test', role: 'ADMIN' as const, participantTypeId: null };
const instructor = { ...admin, id: 8, role: 'INSTRUCTOR' as const };
const course = { id: 2, name: 'PostgreSQL', code: 'PG', instructor: 'Carla', instructorId: 8, status: 'PUBLISHED', startDate: new Date('2026-10-12'), endDate: new Date('2026-11-12') };
const input = { date: '2026-10-11', startTime: '19:00', durationMinutes: 120 };
const record = { id: 3, courseId: 2, ...input, date: new Date(input.date), createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-01') };
describe('course session service', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.course.findUnique.mockResolvedValue(course); mocks.courseSession.findMany.mockResolvedValue([record]); mocks.courseSession.create.mockResolvedValue(record); mocks.courseSession.findUnique.mockResolvedValue(record); mocks.courseSession.update.mockResolvedValue(record); });
  it('creates an out-of-period session with a warning and string identifiers', async () => {
    const result = await courseSessionService.create(2, input, instructor);
    expect(result).toMatchObject({ id: '3', courseId: '2', date: input.date, endTime: '21:00' });
    expect(result.warning).toBeTruthy();
  });
  it('lets administrators manage legacy courses with no linked instructor', async () => {
    mocks.course.findUnique.mockResolvedValue({ ...course, instructorId: null });
    expect((await courseSessionService.list(2, admin)).sessions).toHaveLength(1);
  });
  it('recomputes warnings when course dates change', async () => {
    expect((await courseSessionService.list(2, instructor)).sessions[0].warning).toBeTruthy();
    mocks.course.findUnique.mockResolvedValue({ ...course, startDate: new Date('2026-10-01') });
    expect((await courseSessionService.list(2, instructor)).sessions[0].warning).toBeNull();
  });
  it.each(['list', 'create', 'update'] as const)('denies another instructor on %s', async method => {
    const other = { ...instructor, id: 9 };
    const call = method === 'list' ? courseSessionService.list(2, other) : method === 'create' ? courseSessionService.create(2, input, other) : courseSessionService.update(2, 3, input, other);
    await expect(call).rejects.toMatchObject({ statusCode: 403 });
  });
  it('denies participants', async () => { await expect(courseSessionService.list(2, { ...admin, role: 'PARTICIPANT' })).rejects.toMatchObject({ statusCode: 403 }); });
  it('rejects draft courses', async () => { mocks.course.findUnique.mockResolvedValue({ ...course, status: 'DRAFT' }); await expect(courseSessionService.create(2, input, admin)).rejects.toMatchObject({ statusCode: 400 }); });
  it('returns 404 for a missing course', async () => { mocks.course.findUnique.mockResolvedValue(null); await expect(courseSessionService.list(2, admin)).rejects.toMatchObject({ statusCode: 404 }); });
  it('rejects editing a session belonging to another course', async () => { mocks.courseSession.findUnique.mockResolvedValue({ ...record, courseId: 99 }); await expect(courseSessionService.update(2, 3, input, instructor)).rejects.toMatchObject({ statusCode: 404 }); });
  it('edits an existing session', async () => { expect((await courseSessionService.update(2, 3, input, instructor)).id).toBe('3'); });
  it.each(['create', 'update'] as const)('maps concurrent duplicate failures on %s to 409', async method => {
    mocks.courseSession[method].mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6' }));
    const call = method === 'create' ? courseSessionService.create(2, input, admin) : courseSessionService.update(2, 3, input, admin);
    await expect(call).rejects.toMatchObject({ statusCode: 409 });
  });
  it('returns only published courses assigned to the current instructor', async () => {
    mocks.course.findMany.mockResolvedValue([course]);
    expect((await courseSessionService.teachingCourses(instructor))[0]).toMatchObject({ id: '2', instructorId: '8' });
    expect(mocks.course.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'PUBLISHED', instructorId: 8 } }));
  });
});
