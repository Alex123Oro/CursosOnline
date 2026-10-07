import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, course: { findUnique: vi.fn(), findMany: vi.fn() }, courseSession: { delete: vi.fn(), findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), createManyAndReturn: vi.fn() } }));
vi.mock('../src/config/prisma.js', () => ({ prisma: mocks }));
import { courseSessionRoutes, teachingRoutes } from '../src/modules/course-sessions/course-session.routes.js';
import { errorMiddleware } from '../src/shared/error.middleware.js';
let server: Server; let base: string;
const course = { id: 2, name: 'PostgreSQL', code: 'PG', instructor: 'Carla', instructorId: 8, status: 'PUBLISHED', startDate: new Date('2026-10-12'), endDate: new Date('2026-11-12') };
const payload = { date: '2026-10-11', startTime: '19:00', durationMinutes: 120 };
const record = { id: 3, courseId: 2, ...payload, date: new Date(payload.date), createdAt: new Date(), updatedAt: new Date() };
describe('session HTTP contract and authorization', () => {
  it.each([['1', 204], ['8', 403], ['10', 403], ['', 401]])('deletion requires administrator identity %s', async (id, status) => {
    const response = await fetch(`${base}/courses/2/sessions/3`, { method: 'DELETE', headers: id ? { 'X-User-Id': id } : {} });
    expect(response.status).toBe(status);
    if (status !== 204) expect(mocks.courseSession.delete).not.toHaveBeenCalled();
  });
  beforeAll(async () => {
    const app = express(); app.use(express.json()); app.use('/api/courses', courseSessionRoutes); app.use('/api/teaching', teachingRoutes); app.use(errorMiddleware);
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterAll(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.findUnique.mockImplementation(({ where }) => ({ id: where.id, name: 'User', email: 'user@test', role: where.id === 1 ? 'ADMIN' : where.id === 10 ? 'PARTICIPANT' : 'INSTRUCTOR', participantTypeId: null }));
    mocks.course.findUnique.mockResolvedValue(course); mocks.course.findMany.mockResolvedValue([course]);
    mocks.courseSession.findMany.mockResolvedValue([record]); mocks.courseSession.create.mockResolvedValue(record); mocks.courseSession.findUnique.mockResolvedValue(record); mocks.courseSession.update.mockResolvedValue(record);
  });
  it.each(['GET', 'POST', 'PUT'])('returns 401 to guests on %s', async method => {
    const response = await fetch(`${base}/courses/2/sessions${method === 'PUT' ? '/3' : ''}`, { method, ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}) });
    expect(response.status).toBe(401);
  });
  it('returns 201 on creation and 200 on edit with string ids', async () => {
    for (const method of ['POST', 'PUT']) {
      const response = await fetch(`${base}/courses/2/sessions${method === 'PUT' ? '/3' : ''}`, { method, headers: { 'X-User-Id': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      expect(response.status).toBe(method === 'POST' ? 201 : 200);
      expect(await response.json()).toMatchObject({ id: '3', courseId: '2', date: payload.date, warning: expect.any(String) });
    }
  });
  it.each(['POST', 'PUT'])('denies the assigned instructor on %s', async method => {
    const response = await fetch(`${base}/courses/2/sessions${method === 'PUT' ? '/3' : ''}`, { method, headers: { 'X-User-Id': '8', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    expect(response.status).toBe(403); expect(mocks.courseSession.create).not.toHaveBeenCalled(); expect(mocks.courseSession.update).not.toHaveBeenCalled();
  });
  it.each(['9', '10'])('denies unrelated user %s through the actual route', async id => {
    const response = await fetch(`${base}/courses/2/sessions`, { headers: { 'X-User-Id': id } });
    expect(response.status).toBe(403);
  });
  it('returns field errors for invalid input', async () => {
    const response = await fetch(`${base}/courses/2/sessions`, { method: 'POST', headers: { 'X-User-Id': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, date: '2026-02-30' }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ fields: expect.arrayContaining([expect.objectContaining({ path: 'date' })]) });
  });
  it('rejects invalid course and session identifiers', async () => {
    expect((await fetch(`${base}/courses/abc/sessions`, { headers: { 'X-User-Id': '1' } })).status).toBe(400);
    expect((await fetch(`${base}/courses/2/sessions/0`, { method: 'PUT', headers: { 'X-User-Id': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).status).toBe(400);
  });
  it('creates a weekly batch and returns counts with the refreshed agenda', async () => {
    mocks.courseSession.createManyAndReturn.mockResolvedValue([record]);
    const response = await fetch(`${base}/courses/2/sessions/schedule`, { method: 'POST', headers: { 'X-User-Id': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: '2026-10-12', endDate: '2026-10-21', weekdays: [1, 3], startTime: '18:00', durationMinutes: 90 }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ createdCount: 1, skippedCount: 3, sessions: [expect.objectContaining({ id: '3' })] });
  });
  it.each([['', 401], ['8', 403], ['9', 403], ['10', 403]])('denies unauthorized batches for user %s', async (id, status) => {
    const response = await fetch(`${base}/courses/2/sessions/schedule`, { method: 'POST', headers: { 'X-User-Id': id, 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: '2026-10-12', endDate: '2026-10-21', weekdays: [1], startTime: '18:00', durationMinutes: 90 }) });
    expect(response.status).toBe(status); expect(mocks.courseSession.createManyAndReturn).not.toHaveBeenCalled();
  });
  it('rejects invalid batches without saving any sessions', async () => {
    const response = await fetch(`${base}/courses/2/sessions/schedule`, { method: 'POST', headers: { 'X-User-Id': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: '2026-10-12', endDate: '2026-02-30', weekdays: [1], startTime: '18:00', durationMinutes: 90 }) });
    expect(response.status).toBe(400); expect(mocks.courseSession.createManyAndReturn).not.toHaveBeenCalled();
  });
});
