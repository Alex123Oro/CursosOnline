import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, env } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  env: { nodeEnv: 'test', supabaseUrl: 'https://eva.test.supabase.co', supabasePublishableKey: 'test-key', supabaseSecretKey: undefined }
}));
vi.mock('../src/config/prisma.js', () => ({ prisma: { user: { findUnique } } }));
vi.mock('../src/config/env.js', () => ({ env }));

import { authService, verifyAccessToken } from '../src/modules/auth/auth.service.js';

describe('Supabase authentication', () => {
  it('rotates refresh credentials and returns the authoritative local profile', async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({access_token:'rotated-access',refresh_token:'rotated-refresh',expires_in:3600,user:{id:'auth-id'}})));
    vi.stubGlobal('fetch',transport);
    findUnique.mockResolvedValue({id:5,name:'Ana',email:'ana@example.test',role:'PARTICIPANT',participantTypeId:2,participantType:{name:'Externo'}});
    const result = await authService.refresh('refresh-original');
    expect(transport).toHaveBeenCalledWith(expect.stringContaining('grant_type=refresh_token'),expect.objectContaining({body:JSON.stringify({refresh_token:'refresh-original'})}));
    expect(result).toMatchObject({accessToken:'rotated-access',refreshToken:'rotated-refresh',user:{id:'5',role:'PARTICIPANT'}});
    expect(result.expiresAt).toBeGreaterThan(Date.now()/1000);
  });
  it.each([429,500,503])('keeps temporary provider status %s distinguishable from invalid credentials', async status => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status})));
    await expect(authService.refresh('refresh')).rejects.toMatchObject({statusCode:503});
  });
  it('rejects a revoked refresh token', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:400})));
    await expect(authService.refresh('refresh')).rejects.toMatchObject({statusCode:401});
  });
  it('handles malformed refresh responses as a temporary provider failure', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('not json')));
    await expect(authService.refresh('refresh')).rejects.toMatchObject({statusCode:503});
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    findUnique.mockReset();
  });

  it('does not complete email confirmation with an unconfirmed identity', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'auth-id', email_confirmed_at: null }))));
    await expect(authService.confirmEmail('token')).rejects.toMatchObject({ statusCode: 403 });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('completes confirmation using the verified identity and stored category', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'auth-id', email_confirmed_at: '2026-10-22T10:00:00Z' }))));
    findUnique.mockResolvedValue({ id: 5, name: 'Ana', email: 'ana@est.umss.edu', role: 'PARTICIPANT', participantTypeId: 1, participantType: { name: 'Estudiante' } });
    await expect(authService.confirmEmail('verified-token')).resolves.toMatchObject({ accessToken: 'verified-token', user: { role: 'PARTICIPANT', participantTypeId: '1' } });
  });

  it('explains an unconfirmed login without treating it as a bad password', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'email_not_confirmed' }), { status: 400 })));
    await expect(authService.login('ana@est.umss.edu', 'password')).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('Confirma tu correo') });
  });

  it('rejects invalid credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })));

    await expect(authService.login('bad@example.test', 'wrong')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Correo o contraseña incorrectos.'
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns the local role profile for a valid Supabase session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: 1900000000,
      user: { id: 'auth-id', email: 'luis@example.test' }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    findUnique.mockResolvedValue({
      id: 5,
      name: 'Luis',
      email: 'luis@example.test',
      role: 'PARTICIPANT',
      active: true,
      participantTypeId: 2,
      participantType: { name: 'Estudiante' }
    });

    await expect(authService.login('luis@example.test', 'valid-password')).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: '5', role: 'PARTICIPANT', participantTypeName: 'Estudiante' }
    });
  });

  it('rejects a Supabase account without a local role profile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'access-token', refresh_token: 'refresh-token', user: { id: 'auth-id' }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    findUnique.mockResolvedValue(null);

    await expect(authService.login('orphan@example.test', 'valid-password')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('uses real Supabase credentials for demo accounts and selects only login profile fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'real-luis-token', refresh_token: 'refresh-token',
      user: { id: 'luis-auth-id', email: 'luis@eva.local' }
    }), { status: 200 })));
    findUnique.mockResolvedValue({ id: 5, name: 'Luis', email: 'luis@eva.local',
      role: 'PARTICIPANT', active: true, participantTypeId: 2, participantType: { name: 'Estudiante' } });

    await expect(authService.login('luis@eva.local', 'participante123@')).resolves.toMatchObject({
      accessToken: 'real-luis-token', user: { role: 'PARTICIPANT' }
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { authId: 'luis-auth-id' }, select: {
      id: true, name: true, email: true, role: true, participantTypeId: true,
      participantType: { select: { name: true } }
    } });
  });

  it('rejects legacy demo credentials when Supabase is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(authService.login('admin@eva.local', 'admin1234@')).rejects.toMatchObject({ statusCode: 503 });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects legacy demo credentials when Supabase rejects them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })));
    await expect(authService.login('admin@eva.local', 'admin1234@')).rejects.toMatchObject({ statusCode: 401 });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('does not adopt a profile by matching email', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'token', user: { id: 'unlinked', email: 'admin@eva.local' } }))));
    findUnique.mockResolvedValue(null);
    await expect(authService.login('admin@eva.local', 'password')).rejects.toMatchObject({ statusCode: 403 });
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('revokes the Supabase session on logout', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);

    await expect(authService.logout('access-token')).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/v1/logout'), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer access-token' })
    }));
  });

  it('validates access tokens through Supabase Auth', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'auth-id', email: 'user@example.test' }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })));

    await expect(verifyAccessToken('access-token')).resolves.toMatchObject({ id: 'auth-id' });
  });

  it.each([false, null, undefined])('allows a valid local profile with active=%s on login', async active => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'token', user: { id: 'auth-id' }
    }))));
    findUnique.mockResolvedValue({
      id: 5, name: 'Luis', email: 'luis@example.test', role: 'PARTICIPANT', active,
      participantTypeId: 2, participantType: { name: 'Estudiante' }
    });
    await expect(authService.login('luis@example.test', 'password')).resolves.toMatchObject({
      accessToken: 'token', user: { id: '5', role: 'PARTICIPANT' }
    });
  });

  it.each([429, 500, 503])('keeps upstream status %s distinct from an invalid session', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
    await expect(verifyAccessToken('token')).rejects.toMatchObject({ statusCode: 503 });
  });

  it('reports an auth network failure as unavailable, not invalid credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(verifyAccessToken('token')).rejects.toMatchObject({ statusCode: 503 });
  });
});
