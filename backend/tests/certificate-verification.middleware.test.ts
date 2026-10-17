import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it, vi } from 'vitest';
vi.mock('../src/config/env.js', () => ({ env: { certificateVerificationLimit: 2, certificateVerificationWindowMs: 60000 } }));
import { certificateVerificationLimiter } from '../src/modules/certificates/certificate-verification.middleware.js';
let server: Server;
afterAll(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
describe('verification rate limit', () => {
  it('bounds code enumeration across different codes and includes retry information', async () => {
    const app = express(); app.get('/verify/:code',certificateVerificationLimiter, (_req,res) => { res.json({ ok: true }); });
    server = await new Promise<Server>(resolve => { const listener = app.listen(0,'127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await fetch(`${base}/verify/11111111`)).status).toBe(200);
    expect((await fetch(`${base}/verify/22222222`)).status).toBe(200);
    const response = await fetch(`${base}/verify/33333333`);
    expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBeTruthy();
    expect(await response.json()).toMatchObject({ fields: [] });
  });
});
