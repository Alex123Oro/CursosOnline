import './fixtures/bearer-auth.js';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  user: { findUnique: vi.fn() },
  course: { findUnique: vi.fn(), findMany: vi.fn() },
  enrollment: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
}));
vi.mock('../src/config/prisma.js', () => ({ prisma: db }));
import { enrollmentRoutes } from '../src/modules/enrollments/enrollment.routes.js';
import { errorMiddleware } from '../src/shared/error.middleware.js';
const record = {
  id: 9,
  courseId: 7,
  participantId: 2,
  participantTypeId: 1,
  status: 'PREINSCRITO',
  basePrice: 100,
  scholarshipPercent: 0,
  scholarshipActive: false,
  benefitAmount: 0,
  finalAmount: 100,
  course: { id: 7, name: 'Scrum', code: 'S-2026', capacity: 20 },
  participant: { name: 'Carla', email: 'carla@test' },
  participantType: { name: 'Estudiante' },
  payment: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
let server: Server;
let base: string;
describe('course-scoped enrollment browsing', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/enrollments', enrollmentRoutes);
    app.use(errorMiddleware);
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/enrollments`;
  });
  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      })
  );
  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation((callback) => callback(db));
    db.user.findUnique.mockImplementation(({ where }) => ({
      id: Number(where.authId),
      role: Number(where.authId) === 1 ? 'ADMIN' : 'INSTRUCTOR',
    }));
    db.course.findUnique.mockResolvedValue({ id: 7 });
    db.course.findMany.mockResolvedValue([
      { id: 7, name: 'Scrum', code: 'S-2026', capacity: 20, status: 'DRAFT' },
    ]);
    db.enrollment.findMany.mockResolvedValue([record]);
    db.enrollment.findUnique.mockResolvedValue(record);
    db.enrollment.count.mockResolvedValue(21);
    db.enrollment.groupBy.mockResolvedValue([
      { courseId: 7, status: 'PREINSCRITO', _count: { _all: 4 } },
      { courseId: 7, status: 'INSCRITO', _count: { _all: 2 } },
    ]);
  });
  it('filters in the database and returns fixed-size pagination', async () => {
    const response = await fetch(`${base}?courseId=7&status=PREINSCRITO&page=2&search=Carla`, {
      headers: { Authorization: 'Bearer 1' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [{ id: '9' }],
      total: 21,
      page: 2,
      pageSize: 20,
      totalPages: 2,
    });
    expect(db.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          courseId: 7,
          status: 'PREINSCRITO',
          OR: expect.any(Array),
        }),
        skip: 20,
        take: 20,
      })
    );
  });
  it('clamps an obsolete page after records move to the other tab', async () => {
    db.enrollment.count.mockResolvedValue(1);
    const response = await fetch(`${base}?courseId=7&status=INSCRITO&page=9`, {
      headers: { Authorization: 'Bearer 1' },
    });
    expect(await response.json()).toMatchObject({ page: 1, totalPages: 1 });
  });
  it('includes draft courses in summaries without fetching participant details', async () => {
    const response = await fetch(`${base}/courses`, { headers: { Authorization: 'Bearer 1' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: '7',
        name: 'Scrum',
        code: 'S-2026',
        capacity: 20,
        status: 'DRAFT',
        preenrolledCount: 4,
        enrolledCount: 2,
      },
    ]);
    expect(db.enrollment.findMany).not.toHaveBeenCalled();
  });
  it('loads one enrollment and reports missing records', async () => {
    const response = await fetch(`${base}/9`, { headers: { Authorization: 'Bearer 1' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: '9', participantName: 'Carla' });
    db.enrollment.findUnique.mockResolvedValue(null);
    expect((await fetch(`${base}/999`, { headers: { Authorization: 'Bearer 1' } })).status).toBe(404);
  });
  it.each([
    '?courseId=7',
    '?courseId=no&status=INSCRITO',
    '?courseId=7&status=OTHER',
    '?courseId=7&status=INSCRITO&page=0',
  ])('rejects malformed filters %s', async (query) => {
    expect((await fetch(base + query, { headers: { Authorization: 'Bearer 1' } })).status).toBe(400);
    expect(db.enrollment.findMany).not.toHaveBeenCalled();
  });
  it.each(['', '/courses', '/9'])('protects administrative browsing %s', async (path) => {
    expect((await fetch(base + path)).status).toBe(401);
    expect((await fetch(base + path, { headers: { Authorization: 'Bearer 8' } })).status).toBe(403);
  });
});
