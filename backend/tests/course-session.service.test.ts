import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const mocks = vi.hoisted(() => ({ $transaction: vi.fn(), $queryRaw: vi.fn(), course: { findUnique: vi.fn(), findMany: vi.fn() }, courseSession: { delete: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), createManyAndReturn: vi.fn() } }));
vi.mock('../src/config/prisma.js', () => ({ prisma: mocks }));
import { courseSessionService } from '../src/modules/course-sessions/course-session.service.js';

const admin = { id: 1, name: 'Admin', email: 'admin@test', role: 'ADMIN' as const, participantTypeId: null };
const instructor = { ...admin, id: 8, role: 'INSTRUCTOR' as const };
const course = { id: 2, name: 'PostgreSQL', code: 'PG', instructor: 'Carla', instructorId: 8, status: 'PUBLISHED', startDate: new Date('2026-10-12'), endDate: new Date('2026-11-12') };
const input = { sessionNumber: 1, date: '2026-10-11', startTime: '19:00', durationMinutes: 120 };
const record = { id: 3, courseId: 2, ...input, date: new Date(input.date), createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-01') };
describe('course session service', () => {
  it('deletes only the session in the requested course', async () => {
    mocks.course.findUnique.mockResolvedValue(course);
    await courseSessionService.remove(2, 3, instructor);
    expect(mocks.courseSession.delete).toHaveBeenCalledWith({ where: { id: 3, courseId: 2 } });
  });
  it('allows the assigned instructor to delete a session', async () => {
    mocks.course.findUnique.mockResolvedValue(course);
    await courseSessionService.remove(2, 3, instructor);
    expect(mocks.courseSession.delete).toHaveBeenCalledWith({ where: { id: 3, courseId: 2 } });
  });
  it.each([['P2003', 409], ['P2025', 404]])('maps deletion failure %s to %s', async (code, statusCode) => {
    mocks.courseSession.delete.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('restricted', { code: String(code), clientVersion: '6' }));
    await expect(courseSessionService.remove(2, 3, instructor)).rejects.toMatchObject({ statusCode });
  });
  beforeEach(() => { vi.resetAllMocks(); mocks.$transaction.mockImplementation(callback => callback(mocks)); mocks.$queryRaw.mockResolvedValue([]); mocks.course.findUnique.mockResolvedValue(course); mocks.courseSession.findMany.mockResolvedValue([record]); mocks.courseSession.findFirst.mockResolvedValue(null); mocks.courseSession.create.mockResolvedValue(record); mocks.courseSession.findUnique.mockResolvedValue(record); mocks.courseSession.update.mockResolvedValue(record); });
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
  it('rejects draft courses', async () => { mocks.course.findUnique.mockResolvedValue({ ...course, status: 'DRAFT' }); await expect(courseSessionService.create(2, input, instructor)).rejects.toMatchObject({ statusCode: 400 }); });
  it('returns 404 for a missing course', async () => { mocks.course.findUnique.mockResolvedValue(null); await expect(courseSessionService.list(2, admin)).rejects.toMatchObject({ statusCode: 404 }); });
  it('rejects editing a session belonging to another course', async () => { mocks.courseSession.findUnique.mockResolvedValue({ ...record, courseId: 99 }); await expect(courseSessionService.update(2, 3, input, instructor)).rejects.toMatchObject({ statusCode: 404 }); });
  it('edits an existing session', async () => { expect((await courseSessionService.update(2, 3, input, instructor)).id).toBe('3'); });
  it('allows the assigned instructor to read and write sessions', async () => {
    expect((await courseSessionService.list(2, instructor)).sessions).toHaveLength(1);
    await expect(courseSessionService.create(2, input, instructor)).resolves.toMatchObject({ id: '3' });
    await expect(courseSessionService.update(2, 3, input, instructor)).resolves.toMatchObject({ id: '3' });
    mocks.courseSession.createManyAndReturn.mockResolvedValue([record]);
    await expect(courseSessionService.schedule(2, {startDate:'2026-10-12',endDate:'2026-10-12',weekdays:[1],startTime:'19:00',durationMinutes:60}, instructor)).resolves.toMatchObject({createdCount:1});
  });
  it.each(['create', 'update'] as const)('maps concurrent duplicate failures on %s to 409', async method => {
    mocks.courseSession[method].mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6' }));
    const call = method === 'create' ? courseSessionService.create(2, input, instructor) : courseSessionService.update(2, 3, input, instructor);
    await expect(call).rejects.toMatchObject({ statusCode: 409 });
  });
  it.each(['PRESENT', 'ABSENT'])('blocks editing and deleting after administrator attendance is %s', async status => {
    mocks.courseSession.findUnique.mockResolvedValue({ ...record, instructorAttendance: { status } });
    await expect(courseSessionService.update(2, 3, input, instructor)).rejects.toMatchObject({ statusCode: 409 });
    await expect(courseSessionService.remove(2, 3, instructor)).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.courseSession.update).not.toHaveBeenCalled(); expect(mocks.courseSession.delete).not.toHaveBeenCalled();
    expect(mocks.$queryRaw).toHaveBeenCalledTimes(4);
  });
  it('reports attendance locks in the agenda for both roles', async () => {
    mocks.courseSession.findMany.mockResolvedValue([{ ...record, instructorAttendance: { status: 'ABSENT' } }]);
    for (const user of [admin, instructor]) expect((await courseSessionService.list(2, user)).sessions[0]).toMatchObject({ locked: true, instructorAttendanceStatus: 'ABSENT' });
  });
  it('allows administrators to create single classes and weekly schedules', async () => {
    await expect(courseSessionService.create(2, input, admin)).resolves.toMatchObject({ id: '3' });
    mocks.courseSession.createManyAndReturn.mockResolvedValue([record]);
    await expect(courseSessionService.schedule(2, {startDate:'2026-10-12',endDate:'2026-10-12',weekdays:[1],startTime:'19:00',durationMinutes:60}, admin)).resolves.toMatchObject({ createdCount: 1 });
  });
  it('keeps session edits and deletions restricted to the instructor', async () => {
    await expect(courseSessionService.update(2, 3, input, admin)).rejects.toMatchObject({ statusCode: 403 });
    await expect(courseSessionService.remove(2, 3, admin)).rejects.toMatchObject({ statusCode: 403 });
  });
  it('returns only published courses assigned to the current instructor', async () => {
    mocks.course.findMany.mockResolvedValue([course]);
    expect((await courseSessionService.teachingCourses(instructor))[0]).toMatchObject({ id: '2', instructorId: '8' });
    expect(mocks.course.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'PUBLISHED', instructorId: 8 } }));
  });
});
