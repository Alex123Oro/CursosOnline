import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, env } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  env: { nodeEnv: 'test', supabaseUrl: 'https://eva.test.supabase.co', supabasePublishableKey: 'test-key', supabaseSecretKey: undefined }
}));
vi.mock('../src/config/prisma.js', () => ({ prisma: { user: { findUnique } } }));
vi.mock('../src/config/env.js', () => ({ env }));

import { authService, verifyAccessToken } from '../src/modules/auth/auth.service.js';

describe('Supabase authentication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    findUnique.mockReset();
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
      role: 'PARTICIPANT', participantTypeId: 2, participantType: { name: 'Estudiante' } });

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
});
