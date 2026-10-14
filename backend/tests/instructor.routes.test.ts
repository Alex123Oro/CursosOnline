import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() }, createIdentity: vi.fn(), deleteIdentity: vi.fn() }));
vi.mock('../src/config/prisma.js', () => ({ prisma: { user: mocks.user } }));
vi.mock('../src/modules/instructors/instructor-auth.js', () => ({ instructorAuth: mocks }));
import { instructorRoutes } from '../src/modules/instructors/instructor.routes.js';
import { errorMiddleware } from '../src/shared/error.middleware.js';
import { HttpError } from '../src/shared/http-error.js';
const input = { name: ' Ana Perez ', email: ' ANA@EXAMPLE.COM ', degree: 'Ingeniero', sis: '001234567', phone: ' +591 (700) 123-456 ', password: ' 1234567890 ' };
let server: Server; let base: string;
describe('create instructor HTTP', () => {
  beforeAll(async () => { const app = express(); app.use(express.json()); app.use('/api/admin', instructorRoutes); app.use(errorMiddleware); server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/instructors`; });
  afterAll(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  beforeEach(() => { vi.resetAllMocks(); mocks.user.findUnique.mockImplementation(async ({ where }) => where.authId ? null : { id: 1, role: 'ADMIN' }); mocks.user.findFirst.mockResolvedValue(null); mocks.createIdentity.mockResolvedValue('new-auth'); mocks.deleteIdentity.mockResolvedValue(undefined); mocks.user.create.mockImplementation(async ({ data }) => ({ id: 7, ...data })); });
  const post = (body: unknown = input, user = '1') => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': user }, body: JSON.stringify(body) });
  it('denies anonymous users before creating an account', async () => { expect((await post(input, '')).status).toBe(401); expect(mocks.createIdentity).not.toHaveBeenCalled(); });
  it.each(['INSTRUCTOR', 'PARTICIPANT'])('denies %s', async role => { mocks.user.findUnique.mockResolvedValue({ id: 2, role }); expect((await post()).status).toBe(403); expect(mocks.createIdentity).not.toHaveBeenCalled(); });
  it('creates normalized instructor and returns only profile data', async () => {
    const response = await post(); expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: '7', name: 'Ana Perez', email: 'ana@example.com', degree: 'Ingeniero', sis: '001234567', phone: '+591 (700) 123-456', role: 'INSTRUCTOR', participantTypeId: null, participantTypeName: null });
    expect(mocks.createIdentity).toHaveBeenCalledWith({ name: 'Ana Perez', email: 'ana@example.com', password: input.password });
    expect(mocks.user.create.mock.calls[0]?.[0].data).toEqual({ authId: 'new-auth', name: 'Ana Perez', email: 'ana@example.com', degree: 'ENGINEER', sis: '001234567', phone: '+591 (700) 123-456', role: 'INSTRUCTOR', participantTypeId: null });
  });
  it.each([{ sis: '12345678' }, { sis: 123456789 }, { sis: ' 123456789' }, { phone: '++ ---' }, { phone: 'abc123' }, { degree: 'Doctor' }, { email: 'invalid' }, { name: ' ' }, { password: '12345678901' }, { role: 'ADMIN' }, { authId: 'existing' }])('rejects invalid or extra fields %j', async patch => {
    const response = await post({ ...input, ...patch }); expect(response.status).toBe(400); expect((await response.json()).fields.length).toBeGreaterThan(0); expect(mocks.createIdentity).not.toHaveBeenCalled();
  });
  it.each(['email', 'sis'])('rejects an existing %s without touching Auth', async field => {
    mocks.user.findFirst.mockResolvedValue({ id: 5, email: field === 'email' ? 'ANA@EXAMPLE.COM' : 'other@example.com', sis: field === 'sis' ? input.sis : '987654321' });
    const response = await post(); expect(response.status).toBe(409); expect((await response.json()).fields).toContainEqual(expect.objectContaining({ path: field })); expect(mocks.createIdentity).not.toHaveBeenCalled(); expect(mocks.deleteIdentity).not.toHaveBeenCalled();
    expect(mocks.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ email: { equals: 'ana@example.com', mode: 'insensitive' } }, { sis: input.sis }] } }));
  });
  it.each([['email'], ['sis'], ['authId'], undefined])('compensates concurrent unique collision %j', async target => {
    mocks.user.create.mockRejectedValue({ code: 'P2002', meta: { target } }); const response = await post(); expect(response.status).toBe(409); expect(mocks.deleteIdentity).toHaveBeenCalledWith('new-auth');
    if (target?.[0] === 'email' || target?.[0] === 'sis') expect((await response.json()).fields).toContainEqual(expect.objectContaining({ path: target[0] }));
  });
  it.each([['correo', 'email'], ['codigo_sis', 'sis']])('maps database unique column %s to field %s', async (column, field) => {
    mocks.user.create.mockRejectedValue({ code: 'P2002', meta: { target: [column] } });
    const response = await post(); expect(response.status).toBe(409); expect((await response.json()).fields).toContainEqual(expect.objectContaining({ path: field })); expect(mocks.deleteIdentity).toHaveBeenCalledWith('new-auth');
  });
  it('compensates every profile failure and returns a safe error', async () => { mocks.user.create.mockRejectedValue(new Error(input.password)); const response = await post(); expect(response.status).toBe(500); expect(mocks.deleteIdentity).toHaveBeenCalledWith('new-auth'); expect(await response.text()).not.toContain(input.password); });
  it('logs only new identity identifier on failed compensation', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { mocks.user.create.mockRejectedValue(new Error(input.password)); mocks.deleteIdentity.mockRejectedValue(new Error(input.password)); const response = await post(); expect(response.status).toBe(500); expect(log.mock.calls).toEqual([['instructor_identity_cleanup_failed', { authId: 'new-auth' }]]); expect(await response.text()).not.toContain(input.password); } finally { log.mockRestore(); }
  });
  it.each([400, 409, 503])('preserves safe Auth status %i without persistence or cleanup', async status => { mocks.createIdentity.mockRejectedValue(new HttpError(status, 'Auth no disponible.', [{ path: 'password', message: 'Rechazada.' }])); expect((await post()).status).toBe(status); expect(mocks.user.create).not.toHaveBeenCalled(); expect(mocks.deleteIdentity).not.toHaveBeenCalled(); });
  it('does not leak unexpected Auth failures', async () => { mocks.createIdentity.mockRejectedValue(new Error(input.password)); const response = await post(); expect(response.status).toBe(503); expect(await response.text()).not.toContain(input.password); });
  it('recovers an INSERT committed before its response was lost', async () => {
    let committed: unknown;
    mocks.user.create.mockImplementation(async ({ data }) => { committed = { id: 7, ...data }; throw { code: 'P1017' }; });
    mocks.user.findUnique.mockImplementation(async ({ where }) => where.authId ? committed : { id: 1, role: 'ADMIN' });
    const response = await post(); expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ id: '7', email: 'ana@example.com', sis: input.sis }); expect(mocks.deleteIdentity).not.toHaveBeenCalled();
  });
  it('preserves Auth when an ambiguous DB outcome cannot be reconciled', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { mocks.user.create.mockRejectedValue(new Error(input.password)); mocks.user.findUnique.mockImplementation(async ({ where }) => { if (where.authId) throw new Error(input.password); return { id: 1, role: 'ADMIN' }; }); const response = await post(); expect(response.status).toBe(503); expect(mocks.deleteIdentity).not.toHaveBeenCalled(); expect(log.mock.calls).toEqual([['instructor_profile_creation_unresolved', { authId: 'new-auth' }]]); expect(await response.text()).not.toContain(input.password); } finally { log.mockRestore(); }
  });
  it('preserves Auth when reconciliation finds a mismatched profile', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { mocks.user.create.mockRejectedValue({ code: 'P1001' }); mocks.user.findUnique.mockImplementation(async ({ where }) => where.authId ? { id: 7, authId: 'new-auth', email: 'other@example.com' } : { id: 1, role: 'ADMIN' }); expect((await post()).status).toBe(503); expect(mocks.deleteIdentity).not.toHaveBeenCalled(); } finally { log.mockRestore(); }
  });
});
