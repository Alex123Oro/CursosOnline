import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ user: { findFirst: vi.fn(), findMany: vi.fn() }, course: { findUnique: vi.fn(), findMany: vi.fn() }, courseSession: { findUnique: vi.fn(), findMany: vi.fn() }, instructorAttendance: { upsert: vi.fn() }, $transaction: vi.fn(), $queryRaw: vi.fn() }));
vi.mock('../src/config/prisma.js', () => ({ prisma: db }));
import { instructorAttendanceService } from '../src/modules/instructor-attendance/instructor-attendance.service.js';
import { instructorAttendanceFilters } from '../src/modules/instructor-attendance/instructor-attendance.rules.js';
const admin = { id: 1, role: 'ADMIN' as const, name: 'Admin', email: '', participantTypeId: null };
const course = { id: 2, name: 'Curso', code: 'CUR', instructorId: 8, status: 'PUBLISHED' };
const session = { id: 3, courseId: 2, date: new Date('2026-10-06'), startTime: '15:00', durationMinutes: 60, course, instructorAttendance: null };
const record = { instructorId: 8, status: 'ABSENT', updatedAt: new Date('2026-10-06'), recordedById: 1 };
describe('instructor attendance', () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-07T02:00:00Z'));
    db.$transaction.mockImplementation(cb => cb(db)); db.$queryRaw.mockResolvedValue([]);
    db.user.findFirst.mockResolvedValue({ id: 8, name: 'Carla' }); db.user.findMany.mockResolvedValue([{ id: 8, name: 'Carla' }]);
    db.course.findUnique.mockResolvedValue(course); db.course.findMany.mockResolvedValue([course]);
    db.courseSession.findUnique.mockResolvedValue(session); db.courseSession.findMany.mockResolvedValue([session]);
    db.instructorAttendance.upsert.mockImplementation(({ update }) => ({ ...record, status: update.status }));
  });
  it.each(['INSTRUCTOR', 'PARTICIPANT'] as const)('denies %s for all operations', async role => {
    const user = { ...admin, role };
    await expect(instructorAttendanceService.instructors(user)).rejects.toMatchObject({ statusCode: 403 });
    await expect(instructorAttendanceService.list(8, {}, user)).rejects.toMatchObject({ statusCode: 403 });
    await expect(instructorAttendanceService.save(8, 3, 'PRESENT', user)).rejects.toMatchObject({ statusCode: 403 });
    expect(db.instructorAttendance.upsert).not.toHaveBeenCalled();
  });
  it('lists instructors including those with preserved history', async () => {
    expect(await instructorAttendanceService.instructors(admin)).toEqual([{ id: '8', name: 'Carla' }]);
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ role: 'INSTRUCTOR' }, { teachingAttendance: { some: {} } }] } }));
  });
  it('separates future sessions from eligible summary without percentages', async () => {
    db.courseSession.findMany.mockResolvedValue([{ ...session, instructorAttendance: record }, { ...session, id: 4 }, { ...session, id: 5, date: new Date('2026-10-07') }]);
    const result = await instructorAttendanceService.list(8, {}, admin);
    expect(result.summary).toEqual({ present: 0, absent: 1, pending: 1 });
    expect(result.sessions[2].editable).toBe(false); expect(result).not.toHaveProperty('percentage');
  });
  it('retains saved summary but blocks corrections while the course has no assigned user', async () => {
    db.courseSession.findMany.mockResolvedValue([{...session,course:{...course,instructorId:null},instructorAttendance:record}]);
    const result=await instructorAttendanceService.list(8,{},admin);
    expect(result.summary.absent).toBe(1); expect(result.sessions[0].editable).toBe(false);
    expect(result.sessions[0].blockedReason).toContain('Asigna');
  });
  it('queries own records and unmarked currently assigned sessions with inclusive filters', async () => {
    await instructorAttendanceService.list(8, { courseId: 2, from: '2026-10-01', to: '2026-10-06' }, admin);
    expect(db.courseSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ courseId: 2, date: { gte: new Date('2026-10-01'), lte: new Date('2026-10-06') }, OR: [{ instructorAttendance: { is: { instructorId: 8 } } }, { course: { instructorId: 8 }, instructorAttendance: { is: null } }] }) }));
  });
  it('creates one record with original instructor and administrator', async () => {
    expect(await instructorAttendanceService.save(8, 3, 'PRESENT', admin)).toMatchObject({ status: 'PRESENT' });
    expect(db.instructorAttendance.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { sessionId: 3 }, create: expect.objectContaining({ instructorId: 8, courseId: 2, recordedById: 1 }), update: { status: 'PRESENT', recordedById: 1 } }));
  });
  it('corrects the original instructor after course reassignment', async () => {
    db.course.findUnique.mockResolvedValue({ ...course, instructorId: 9 });
    db.courseSession.findUnique.mockResolvedValue({ ...session, instructorAttendance: record });
    await expect(instructorAttendanceService.save(8, 3, 'PRESENT', admin)).resolves.toMatchObject({ status: 'PRESENT' });
  });
  it('prevents transferring a saved record to the newly assigned instructor', async () => {
    db.course.findUnique.mockResolvedValue({ ...course, instructorId: 9 });
    db.courseSession.findUnique.mockResolvedValue({ ...session, instructorAttendance: record });
    await expect(instructorAttendanceService.save(9, 3, 'PRESENT', admin)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('rejects another instructor on the first mark', async () => { await expect(instructorAttendanceService.save(9, 3, 'PRESENT', admin)).rejects.toMatchObject({ statusCode: 400 }); });
  it('rejects future sessions using Bolivia today', async () => { db.courseSession.findUnique.mockResolvedValue({ ...session, date: new Date('2026-10-07') }); await expect(instructorAttendanceService.save(8, 3, 'PRESENT', admin)).rejects.toMatchObject({ statusCode: 400 }); });
  it.each([null, { ...course, status: 'DRAFT' }, { ...course, instructorId: null }])('rejects invalid courses %j', async value => {
    db.course.findUnique.mockResolvedValue(value); await expect(instructorAttendanceService.save(8, 3, 'PRESENT', admin)).rejects.toMatchObject({ statusCode: value ? 400 : 404 });
  });
  it('rejects nonexistent sessions', async () => { db.courseSession.findUnique.mockResolvedValue(null); await expect(instructorAttendanceService.save(8, 3, 'PRESENT', admin)).rejects.toMatchObject({ statusCode: 404 }); });
  it('rejects unknown instructor', async () => { db.user.findFirst.mockResolvedValue(null); await expect(instructorAttendanceService.list(8, {}, admin)).rejects.toMatchObject({ statusCode: 404 }); });
  it.each([{ from: '2026-02-30' }, { from: '2026-10-07', to: '2026-10-06' }, { courseId: '0' }, { to: ['2026-10-06'] }])('rejects invalid filters %j', filters => { expect(instructorAttendanceFilters.safeParse(filters).success).toBe(false); });
});
