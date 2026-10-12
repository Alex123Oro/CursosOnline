import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ course: { findUnique: vi.fn() }, courseSession: { findMany: vi.fn(), findUnique: vi.fn() }, enrollment: { findMany: vi.fn(), findUnique: vi.fn() }, attendance: { upsert: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn() }));
vi.mock('../src/config/prisma.js', () => ({ prisma: mocks }));
import { attendanceService } from '../src/modules/attendance/attendance.service.js';
import { attendanceInputSchema, boliviaToday } from '../src/modules/attendance/attendance.rules.js';
const admin = { id: 1, name: 'Admin', email: 'admin@test', role: 'ADMIN' as const, participantTypeId: null };
const instructor = { ...admin, id: 8, role: 'INSTRUCTOR' as const };
const course = { id: 2, name: 'PostgreSQL', code: 'PG', instructor: 'Carla', instructorId: 8, status: 'PUBLISHED' };
const sessions = [1, 2, 3, 4, 5].map(id => ({ id, courseId: 2, date: new Date(id === 5 ? '2026-10-08' : `2026-10-0${id}`), startTime: '18:00', durationMinutes: 60 }));
const records = [1, 2, 3, 4].map(sessionId => ({ sessionId, status: sessionId === 4 ? 'ABSENT' : 'PRESENT', updatedAt: new Date('2026-10-06') }));
const enrollment = { id: 3, courseId: 2, status: 'INSCRITO', participantId: 10, participant: { name: 'Luis' }, attendance: records };
describe('participant attendance', () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-07T02:00:00Z'));
    mocks.$transaction.mockImplementation(callback => callback(mocks)); mocks.$queryRaw.mockResolvedValue([]);
    mocks.course.findUnique.mockResolvedValue(course); mocks.courseSession.findMany.mockResolvedValue(sessions); mocks.courseSession.findUnique.mockResolvedValue(sessions[0]);
    mocks.enrollment.findMany.mockResolvedValue([enrollment]); mocks.enrollment.findUnique.mockResolvedValue(enrollment); mocks.attendance.upsert.mockImplementation(({ where, update }) => ({ sessionId: where.sessionId_enrollmentId.sessionId, status: update.status, updatedAt: new Date('2026-10-06') }));
  });
  it('uses the Bolivia date before UTC midnight boundaries', () => { expect(boliviaToday(new Date('2026-10-07T02:00:00Z'))).toBe('2026-10-06'); });
  it('calculates 75 percent only over saved records and excludes future sessions from pending', async () => {
    const result = await attendanceService.list(2, instructor);
    expect(result.students[0]).toMatchObject({ percentage: 75, presentCount: 3, absentCount: 1, pendingCount: 0 });
    expect(result.sessions.at(-1)?.editable).toBe(false);
    expect(mocks.enrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { courseId: 2, status: 'INSCRITO' } }));
  });
  it('returns null percentage for no saved records and reports previous sessions as pending', async () => {
    mocks.enrollment.findMany.mockResolvedValue([{ ...enrollment, attendance: [] }]);
    expect((await attendanceService.list(2, admin)).students[0]).toMatchObject({ percentage: null, pendingCount: 4 });
  });
  it('shows 75 percent with two additional unmarked past classes', async () => {
    mocks.courseSession.findMany.mockResolvedValue([...sessions, { ...sessions[0], id: 6 }, { ...sessions[1], id: 7 }]);
    expect((await attendanceService.list(2, admin)).students[0]).toMatchObject({ percentage: 75, pendingCount: 2 });
  });
  it('saves and corrects using the same unique student/session record', async () => {
    await attendanceService.save(2, 1, 3, 'PRESENT', instructor);
    expect((await attendanceService.save(2, 1, 3, 'ABSENT', admin)).percentage).toBe(50);
    expect(mocks.attendance.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ where: { sessionId_enrollmentId: { sessionId: 1, enrollmentId: 3 } }, update: { status: 'ABSENT', recordedById: 1 } }));
  });
  it.each(['list', 'save'] as const)('denies another instructor on %s', async method => {
    await expect(method === 'list' ? attendanceService.list(2, { ...instructor, id: 9 }) : attendanceService.save(2, 1, 3, 'PRESENT', { ...instructor, id: 9 })).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.attendance.upsert).not.toHaveBeenCalled();
  });
  it('denies participants', async () => { await expect(attendanceService.list(2, { ...admin, role: 'PARTICIPANT' })).rejects.toMatchObject({ statusCode: 403 }); });
  it('rejects future sessions', async () => { mocks.courseSession.findUnique.mockResolvedValue(sessions[4]); await expect(attendanceService.save(2, 5, 3, 'PRESENT', instructor)).rejects.toMatchObject({ statusCode: 400 }); expect(mocks.attendance.upsert).not.toHaveBeenCalled(); });
  it.each([{ status: 'PREINSCRITO' }, { courseId: 9 }, null])('rejects unofficial or unrelated enrollments %j', async change => {
    mocks.enrollment.findUnique.mockResolvedValue(change ? { ...enrollment, ...change } : null);
    await expect(attendanceService.save(2, 1, 3, 'PRESENT', instructor)).rejects.toMatchObject({ statusCode: change?.status ? 400 : 404 });
    expect(mocks.attendance.upsert).not.toHaveBeenCalled();
  });
  it('rejects a session belonging to another course', async () => { mocks.courseSession.findUnique.mockResolvedValue({ ...sessions[0], courseId: 9 }); await expect(attendanceService.save(2, 1, 3, 'PRESENT', admin)).rejects.toMatchObject({ statusCode: 404 }); });
  it.each([null, { ...course, status: 'DRAFT' }])('rejects missing or draft courses', async value => { mocks.course.findUnique.mockResolvedValue(value); await expect(attendanceService.list(2, admin)).rejects.toMatchObject({ statusCode: value ? 400 : 404 }); });
  it.each(['JUSTIFIED', '', null])('rejects an unsupported status %s', status => { expect(attendanceInputSchema.safeParse({ status }).success).toBe(false); });
});
