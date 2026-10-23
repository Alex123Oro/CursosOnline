import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  revoke: vi.fn(), reissue: vi.fn(),
  auth: { getUser: vi.fn() }, from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(),
  issue: vi.fn(), verify: vi.fn(), mine: vi.fn(), owned: vi.fn(), downloadable: vi.fn(), roster: vi.fn(), courses: vi.fn(), bulk: vi.fn(), generate: vi.fn()
}));
vi.mock('../src/config/supabase.js', () => ({ getServerSupabase: () => mocks }));
vi.mock('../src/modules/certificates/certificate.service.js', () => ({ certificateService: mocks }));
vi.mock('../src/modules/certificates/certificate-pdf.service.js', () => ({ certificatePdfService: { generate: mocks.generate } }));
vi.mock('../src/config/env.js', () => ({ env: { certificateVerificationLimit: 1000, certificateVerificationWindowMs: 60000 } }));
import { certificateRoutes, courseCertificateRoutes } from '../src/modules/certificates/certificate.routes.js';
import { errorMiddleware } from '../src/shared/error.middleware.js';
import { HttpError } from '../src/shared/http-error.js';

let server: Server; let base: string;
const privateCertificate = { id: '7', code: '8F72A91C', courseName: 'Programación básica', status: 'VALID' };
describe('certificate HTTP contract and Bearer authorization', () => {
  it.each(['revoke','reissue'])('requires an administrator and a reason for %s', async operation => {
    const send = (reason: string) => fetch(`${base}/certificates/7/${operation}`,{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},body:JSON.stringify({reason,...(operation === 'reissue'?{type:'aprobacion'}:{})})});
    expect((await send('Corrección académica')).status).toBe(403);
    mocks.maybeSingle.mockResolvedValue({data:{id:1,rol:'administrador',activo:true},error:null});
    expect((await send('  ')).status).toBe(400);
    mocks[operation].mockResolvedValue(privateCertificate);
    expect((await send('Corrección académica')).status).toBe(operation === 'revoke'?200:201);
    expect(mocks[operation]).toHaveBeenCalledWith('7','1','Corrección académica',...(operation==='reissue'?['aprobacion',undefined]:[]));
  });
  beforeAll(async () => {
    const app = express(); app.use(express.json()); app.use('/api/certificates',certificateRoutes); app.use('/api/courses',courseCertificateRoutes); app.use(errorMiddleware);
    server = await new Promise<Server>(resolve => { const listener = app.listen(0,'127.0.0.1', () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterAll(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  beforeEach(() => {
    vi.resetAllMocks(); mocks.auth.getUser.mockResolvedValue({ data: { user: { id: 'auth-9' } }, error: null });
    mocks.from.mockReturnValue(mocks); mocks.select.mockReturnValue(mocks); mocks.eq.mockReturnValue(mocks);
    mocks.maybeSingle.mockResolvedValue({ data: { id: 9, rol: 'participante', activo: true }, error: null });
    mocks.verify.mockResolvedValue({ status: 'VALID', message: 'Certificado válido', code: '8F72A91C' });
    mocks.mine.mockResolvedValue([]); mocks.issue.mockResolvedValue(privateCertificate);
    mocks.downloadable.mockResolvedValue(privateCertificate); mocks.generate.mockResolvedValue(Buffer.from('%PDF-1.7 test'));
  });
  const get = (path: string, token?: string) => fetch(`${base}${path}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  const post = (token?: string, body: unknown = { enrollmentId: '12' }) => fetch(`${base}/certificates`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body)
  });
  it('verifies without a session and ignores expired credentials on the public route', async () => {
    expect((await get('/certificates/verify/8f72a91c')).status).toBe(200);
    expect((await get('/certificates/verify/8F72A91C','expired')).status).toBe(200);
    expect(mocks.auth.getUser).not.toHaveBeenCalled(); expect(mocks.verify).toHaveBeenCalledWith('8F72A91C');
  });
  it('rejects malformed codes before accessing the service', async () => {
    const response = await get('/certificates/verify/ZZZZZZZZ');
    expect(response.status).toBe(400); expect(await response.json()).toHaveProperty('fields'); expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('returns 404 for nonexistent certificates and 200 for annulled ones', async () => {
    mocks.verify.mockRejectedValueOnce(new HttpError(404,'Certificado no válido o inexistente'));
    expect((await get('/certificates/verify/11111111')).status).toBe(404);
    mocks.verify.mockResolvedValueOnce({ status: 'REVOKED', message: 'Certificado anulado', code: '8F72A91C' });
    expect(await (await get('/certificates/verify/8F72A91C')).json()).toMatchObject({ status: 'REVOKED' });
  });
  it('requires a token and never accepts X-User-Id', async () => {
    expect((await post()).status).toBe(401);
    expect((await fetch(`${base}/certificates/me`,{ headers: { 'X-User-Id': '9' } })).status).toBe(401);
  });
  it('rejects an invalid token or inactive profile', async () => {
    mocks.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 401 } });
    expect((await get('/certificates/me','invalid')).status).toBe(401);
    mocks.maybeSingle.mockResolvedValueOnce({ data: { id: 9, rol: 'participante', activo: false }, error: null });
    expect((await get('/certificates/me','valid')).status).toBe(401);
  });
  it.each(['participante','instructor'])('denies emission to %s', async rol => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: 9, rol, activo: true }, error: null });
    expect((await post('valid')).status).toBe(403); expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('allows only an administrator to emit and rejects extraneous owner fields', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: 1, rol: 'administrador', activo: true }, error: null });
    expect((await post('valid')).status).toBe(201); expect(mocks.issue).toHaveBeenCalledWith('12','1','aprobacion');
    expect((await post('valid',{ enrollmentId: '12', participantId: '99' })).status).toBe(400);
  });
  it.each([400,409])('preserves the domain emission error %s', async status => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: 1, rol: 'administrador', activo: true }, error: null });
    mocks.issue.mockRejectedValue(new HttpError(status,'Cannot issue'));
    expect((await post('valid')).status).toBe(status);
  });
  it('passes the type through roster, individual issuance and bulk issuance', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: 1, rol: 'administrador', activo: true }, error: null });
    mocks.roster.mockResolvedValue({ students: [] }); mocks.bulk.mockResolvedValue({ issued: [], failed: [] });
    expect((await get('/courses/2/certificates?type=participacion','valid')).status).toBe(200);
    expect(mocks.roster).toHaveBeenCalledWith('2','participacion');
    expect((await post('valid',{ enrollmentId: '12', type: 'participacion' })).status).toBe(201);
    expect(mocks.issue).toHaveBeenCalledWith('12','1','participacion');
    const response = await fetch(`${base}/courses/2/certificates/bulk`, { method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ enrollmentIds: ['12'], type: 'participacion' }) });
    expect(response.status).toBe(200); expect(mocks.bulk).toHaveBeenCalledWith('2',['12'],'1','participacion');
    expect((await get('/courses/2/certificates?type=instructor','valid')).status).toBe(400);
  });
  it('lists certificates using only the token profile, ignoring query-string identity', async () => {
    const response = await get('/certificates/me?participantId=99','valid');
    expect(response.status).toBe(200); expect(await response.json()).toEqual([]); expect(mocks.mine).toHaveBeenCalledWith('9');
    expect(mocks.eq).toHaveBeenCalledWith('auth_id','auth-9');
  });
  it('returns 404 on a foreign certificate', async () => {
    mocks.owned.mockRejectedValue(new HttpError(404,'Certificado no encontrado.'));
    expect((await get('/certificates/me/7','valid')).status).toBe(404); expect(mocks.owned).toHaveBeenCalledWith('7','9');
  });
  it('downloads a private PDF with safe descriptive headers', async () => {
    const response = await get('/certificates/me/7/pdf','valid');
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toContain('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('certificado-Programacion-basica-8F72A91C.pdf');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toMatch(/^%PDF/); expect(mocks.downloadable).toHaveBeenCalledWith('7','9');
  });
});
