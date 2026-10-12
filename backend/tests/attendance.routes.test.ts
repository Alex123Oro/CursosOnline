import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, list: vi.fn(), save: vi.fn() }));
vi.mock('../src/config/prisma.js', () => ({ prisma: { user: mocks.user } }));
vi.mock('../src/modules/attendance/attendance.service.js', () => ({ attendanceService: { list: mocks.list, save: mocks.save } }));
import { attendanceRoutes } from '../src/modules/attendance/attendance.routes.js';
import { errorMiddleware } from '../src/shared/error.middleware.js';
let server: Server; let base: string;
describe('attendance HTTP contract', () => {
  beforeAll(async () => {
    const app = express(); app.use(express.json()); app.use('/api/courses', attendanceRoutes); app.use(errorMiddleware);
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/courses`;
  });
  afterAll(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  beforeEach(() => { vi.resetAllMocks(); mocks.user.findUnique.mockResolvedValue({ id: 8, name: 'Instructor', role: 'INSTRUCTOR', participantTypeId: null }); mocks.list.mockResolvedValue({ students: [] }); mocks.save.mockResolvedValue({ enrollmentId: '3', percentage: 100 }); });
  const put = (path: string, status: unknown, user = '8') => fetch(`${base}/${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-User-Id': user }, body: JSON.stringify({ status }) });
  it('returns 401 to guests on read and write', async () => {
    expect((await fetch(`${base}/2/attendance`)).status).toBe(401);
    expect((await put('2/sessions/1/attendance/3', 'PRESENT', '')).status).toBe(401);
  });
  it.each(['PRESENT', 'ABSENT'])('accepts a %s correction with 200 and updated summary', async status => {
    const response = await put('2/sessions/1/attendance/3', status);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ enrollmentId: '3' });
    expect(mocks.save).toHaveBeenCalledWith(2, 1, 3, status, expect.objectContaining({ id: 8 }));
  });
  it.each(['2/sessions/abc/attendance/3', '0/sessions/1/attendance/3', '2/sessions/1/attendance/-1'])('rejects invalid ids %s', async path => { expect((await put(path, 'PRESENT')).status).toBe(400); expect(mocks.save).not.toHaveBeenCalled(); });
  it('rejects unsupported states', async () => { expect((await put('2/sessions/1/attendance/3', 'JUSTIFIED')).status).toBe(400); expect(mocks.save).not.toHaveBeenCalled(); });
});
