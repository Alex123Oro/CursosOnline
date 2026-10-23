import './fixtures/bearer-auth.js';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ enrollment: { count: vi.fn() }, courseResult: { updateMany: vi.fn() }, $transaction: vi.fn(), $queryRaw: vi.fn(), user: { findUnique: vi.fn() }, courseInstructor: { findUnique: vi.fn() }, course: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() }, courseSession: { count: vi.fn(), delete: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), createManyAndReturn: vi.fn() } }));
vi.mock('../src/config/prisma.js', () => ({ prisma: mocks }));
import { courseSessionRoutes, teachingRoutes } from '../src/modules/course-sessions/course-session.routes.js';
import { courseRoutes } from '../src/modules/courses/course.routes.js';
import { errorMiddleware } from '../src/shared/error.middleware.js';
let server: Server; let base: string;
const course = { id: 2, name: 'PostgreSQL', code: 'PG', instructor: 'Carla', instructorId: 8, status: 'PUBLISHED', startDate: new Date('2026-10-12'), endDate: new Date('2026-11-12') };
const payload = { sessionNumber: 1, date: '2026-10-11', startTime: '19:00', durationMinutes: 120 };
const record = { id: 3, courseId: 2, ...payload, date: new Date(payload.date), createdAt: new Date(), updatedAt: new Date(), _count: { attendance: 0 }, instructorAttendance: [] };
describe('session HTTP contract and authorization', () => {
  it.each([['1', 403], ['8', 204], ['10', 403], ['', 401]])('deletion requires an assigned manager identity %s', async (id, status) => {
    const response = await fetch(`${base}/courses/2/sessions/3`, { method: 'DELETE', headers: id ? { Authorization: id ? `Bearer ${id}` : '' } : {} });
    expect(response.status).toBe(status);
    if (status !== 204) expect(mocks.courseSession.delete).not.toHaveBeenCalled();
  });
  beforeAll(async () => {
    const app = express(); app.use(express.json()); app.use('/api/courses', courseSessionRoutes); app.use('/api/courses', courseRoutes); app.use('/api/teaching', teachingRoutes); app.use(errorMiddleware);
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterAll(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  beforeEach(() => {
    vi.resetAllMocks(); mocks.$queryRaw.mockResolvedValue([]); mocks.$transaction.mockImplementation(callback => callback(mocks)); mocks.$queryRaw.mockResolvedValue([]);
    mocks.user.findUnique.mockImplementation(({ where }) => ({ id: Number(where.authId), active: true, name: 'User', email: 'user@test', role: Number(where.authId) === 1 ? 'ADMIN' : Number(where.authId) === 10 ? 'PARTICIPANT' : 'INSTRUCTOR', participantTypeId: null }));
    mocks.course.findUnique.mockResolvedValue(course); mocks.course.findMany.mockResolvedValue([course]);
    mocks.courseSession.findFirst.mockImplementation(({ where }) => where.date && where.date.toISOString().slice(0, 10) !== '2026-10-12' ? { id: 99 } : null);
    mocks.courseSession.count.mockResolvedValue(2); mocks.courseSession.findMany.mockResolvedValue([record]); mocks.courseSession.create.mockResolvedValue(record); mocks.courseSession.findUnique.mockResolvedValue(record); mocks.courseSession.update.mockResolvedValue(record);
  });
  it.each(['GET', 'POST', 'PUT'])('returns 401 to guests on %s', async method => {
    const response = await fetch(`${base}/courses/2/sessions${method === 'PUT' ? '/3' : ''}`, { method, ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}) });
    expect(response.status).toBe(401);
  });
  it('returns 201 on creation and 200 on edit with string ids', async () => {
    for (const method of ['POST', 'PUT']) {
      const response = await fetch(`${base}/courses/2/sessions${method === 'PUT' ? '/3' : ''}`, { method, headers: { Authorization: 'Bearer 8', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      expect(response.status).toBe(method === 'POST' ? 201 : 200);
      expect(await response.json()).toMatchObject({ id: '3', courseId: '2', date: payload.date, warning: expect.any(String) });
    }
  });
  it.each(['POST', 'PUT'])('allows the assigned instructor on %s', async method => {
    const response = await fetch(`${base}/courses/2/sessions${method === 'PUT' ? '/3' : ''}`, { method, headers: { Authorization: 'Bearer 8', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    expect(response.status).toBe(method === 'POST' ? 201 : 200); expect(method === 'POST' ? mocks.courseSession.create : mocks.courseSession.update).toHaveBeenCalled();
  });
  it.each(['9', '10'])('denies unrelated user %s through the actual route', async id => {
    const response = await fetch(`${base}/courses/2/sessions`, { headers: { Authorization: id ? `Bearer ${id}` : '' } });
    expect(response.status).toBe(403);
  });
  it('returns field errors for invalid input', async () => {
    const response = await fetch(`${base}/courses/2/sessions`, { method: 'POST', headers: { Authorization: 'Bearer 8', 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, date: '2026-02-30' }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ fields: expect.arrayContaining([expect.objectContaining({ path: 'date' })]) });
  });
  it('rejects invalid course and session identifiers', async () => {
    expect((await fetch(`${base}/courses/abc/sessions`, { headers: { Authorization: 'Bearer 8' } })).status).toBe(400);
    expect((await fetch(`${base}/courses/2/sessions/0`, { method: 'PUT', headers: { Authorization: 'Bearer 8', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).status).toBe(400);
  });
  it('creates a weekly batch and returns counts with the refreshed agenda', async () => {
    mocks.courseSession.createManyAndReturn.mockResolvedValue([record]);
    const response = await fetch(`${base}/courses/2/sessions/schedule`, { method: 'POST', headers: { Authorization: 'Bearer 8', 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: '2026-10-12', endDate: '2026-10-21', weekdays: [1, 3], startTime: '18:00', durationMinutes: 90 }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ createdCount: 1, skippedCount: 3, sessions: [expect.objectContaining({ id: '3' })] });
  });
  it.each([['', 401], ['9', 403], ['10', 403]])('denies unauthorized batches for user %s', async (id, status) => {
    const response = await fetch(`${base}/courses/2/sessions/schedule`, { method: 'POST', headers: { Authorization: id ? `Bearer ${id}` : '', 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: '2026-10-12', endDate: '2026-10-21', weekdays: [1], startTime: '18:00', durationMinutes: 90 }) });
    expect(response.status).toBe(status); expect(mocks.courseSession.createManyAndReturn).not.toHaveBeenCalled();
  });
  it.each(['PRESENT', 'ABSENT'])('returns 409 to an instructor changing a marked session (%s)', async status => {
    mocks.courseSession.findUnique.mockResolvedValue({ ...record, instructorAttendance: [{ status }] });
    for (const method of ['PUT', 'DELETE']) {
      const response = await fetch(`${base}/courses/2/sessions/3`, { method, headers: { Authorization: 'Bearer 8', 'Content-Type': 'application/json' }, ...(method === 'PUT' ? { body: JSON.stringify(payload) } : {}) });
      expect(response.status).toBe(409);
    }
    expect(mocks.courseSession.update).not.toHaveBeenCalled(); expect(mocks.courseSession.delete).not.toHaveBeenCalled();
  });
  it('allows administrators to create individual and weekly classes through the API', async () => {
    const headers = { Authorization: 'Bearer 1', 'Content-Type': 'application/json' };
    const single = await fetch(`${base}/courses/2/sessions`, { method: 'POST', headers, body: JSON.stringify(payload) });
    expect(single.status).toBe(201);
    mocks.courseSession.createManyAndReturn.mockResolvedValue([record]);
    const weekly = await fetch(`${base}/courses/2/sessions/schedule`, { method: 'POST', headers, body: JSON.stringify({ startDate: '2026-10-12', endDate: '2026-10-21', weekdays: [1, 3], startTime: '18:00', durationMinutes: 90 }) });
    expect(weekly.status).toBe(201);
  });
  it.each(['single', 'weekly'])('breaks the draft/publication cycle through the API with %s classes', async mode => {
    const headers = { Authorization: 'Bearer 1', 'Content-Type': 'application/json' };
    const draft = { ...course, status: 'DRAFT', schedule: null, capacity: 20,
      preinscriptionStart: new Date('2026-09-01'), preinscriptionEnd: new Date('2026-09-30'),
      sessions: [] as typeof record[], prices: [{ participantTypeId: 1, participantType: { name: 'Estudiante' }, basePrice: 100 }], _count: { enrollments: 0 }, createdAt: new Date(), updatedAt: new Date() };
    mocks.course.findUnique.mockImplementation(async () => draft);
    mocks.course.update.mockImplementation(async ({ data }) => Object.assign(draft, data));
    expect((await fetch(`${base}/courses/2/sessions`, { headers })).status).toBe(200);
    expect((await fetch(`${base}/courses/2/publish`, { method: 'PATCH', headers })).status).toBe(400);
    mocks.courseSession.create.mockImplementation(async () => { draft.sessions.push(record); return record; });
    mocks.courseSession.createManyAndReturn.mockImplementation(async () => { draft.sessions.push(record); return [record]; });
    const response = await fetch(`${base}/courses/2/sessions${mode === 'weekly' ? '/schedule' : ''}`, {
      method: 'POST', headers, body: JSON.stringify(mode === 'single' ? payload : {
        startDate: '2026-10-12', endDate: '2026-10-12', weekdays: [1], startTime: '19:00', durationMinutes: 120
      })
    });
    expect(response.status).toBe(201);
    const published = await fetch(`${base}/courses/2/publish`, { method: 'PATCH', headers });
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({ status: 'PUBLISHED', schedule: 'Dom 19:00–21:00' });
  });
  it('rejects invalid batches without saving any sessions', async () => {
    const response = await fetch(`${base}/courses/2/sessions/schedule`, { method: 'POST', headers: { Authorization: 'Bearer 8', 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: '2026-10-12', endDate: '2026-02-30', weekdays: [1], startTime: '18:00', durationMinutes: 90 }) });
    expect(response.status).toBe(400); expect(mocks.courseSession.createManyAndReturn).not.toHaveBeenCalled();
  });
  it('refuses returning a published course to draft while reservations or enrollments remain', async () => {
    const existing = { ...course, capacity: 20, schedule: null, sessions: [record],
      preinscriptionStart: new Date('2026-09-01'), preinscriptionEnd: new Date('2026-09-30'),
      prices: [{ participantTypeId: 1, participantType: { name: 'Estudiante' }, basePrice: 100 }],
      enrollments: [{ status: 'INSCRITO' }], _count: { enrollments: 2 }, createdAt: new Date(), updatedAt: new Date() };
    mocks.course.findUnique.mockResolvedValue(existing);
    mocks.enrollment.count.mockResolvedValue(2);
    mocks.course.update.mockImplementation(async ({ data }) => Object.assign(existing, data));
    const headers = { Authorization: 'Bearer 1' };
    const draft = await fetch(`${base}/courses/2/unpublish`, { method: 'PATCH', headers });
    expect(draft.status).toBe(409);
    expect(mocks.course.update).not.toHaveBeenCalled();
    expect(mocks.courseSession.delete).not.toHaveBeenCalled();
    const published = await fetch(`${base}/courses/2/publish`, { method: 'PATCH', headers });
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({ status: 'PUBLISHED', occupiedSlots: 2 });
  });
  it.each([['', 401], ['8', 403], ['10', 403]])('restricts unpublishing to administrators: %s', async (id, status) => {
    const response = await fetch(`${base}/courses/2/unpublish`, { method: 'PATCH', headers: id ? { Authorization: id ? `Bearer ${id}` : '' } : {} });
    expect(response.status).toBe(status);
    expect(mocks.course.update).not.toHaveBeenCalled();
  });
});
