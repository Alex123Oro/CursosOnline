import { beforeEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => ({ env: {
  supabaseUrl: 'https://auth.example.test', supabasePublishableKey: 'public-key',
  supabaseSecretKey: 'never-send-this-key', publicAppUrl: 'http://127.0.0.1:4300',
  authEmailRedirectUrl: undefined as string | undefined
} }));
vi.mock('../src/config/env.js', () => ({ env }));
import { registrationService, registrationSchema } from '../src/modules/auth/registration.service.js';

const input = { name: 'Ana Pérez', email: '20260001@est.umss.edu', password: 'a-strong-password', participantKind: 'UMSS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const settings = () => json({ disable_signup: false, mailer_autoconfirm: false, external: { email: true } });

describe('verified participant registration', () => {
  beforeEach(() => { vi.restoreAllMocks(); env.authEmailRedirectUrl = undefined; });

  it.each(['student@est.umss.edu', 'student@ms.umss.edu', ' Student@EST.UMSS.EDU '])('accepts exact student address %s', email => {
    expect(registrationSchema.parse({ ...input, email }).email).toBe(email.trim().toLowerCase());
  });
  it.each(['user@gmail.com', 'user@umss.edu', 'user@est.umss.edu.evil.test', 'user@fake.est.umss.edu', 'user@est.umss.edu@evil.test'])('rejects an unqualified UMSS claim: %s', email => {
    expect(registrationSchema.safeParse({ ...input, email }).success).toBe(false);
  });
  it('requires institutional email holders to use the UMSS option', () => {
    expect(registrationSchema.safeParse({ ...input, participantKind: 'EXTERNAL' }).success).toBe(false);
  });
  it('does not accept client supplied roles, category IDs or verification flags', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(registrationService.register({ ...input, role: 'ADMIN', participantTypeId: 1, emailVerified: true })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends only public signup data and returns no session before confirmation', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(settings()).mockResolvedValueOnce(json({ id: 'auth-id', email_confirmed_at: null }));
    vi.stubGlobal('fetch', fetch);
    await expect(registrationService.register(input)).resolves.toEqual({ message: expect.any(String) });
    expect(fetch.mock.calls[1]?.[0]).toBe('https://auth.example.test/auth/v1/signup?redirect_to=http%3A%2F%2F127.0.0.1%3A4300%2Fconfirmar-correo');
    const options = fetch.mock.calls[1]?.[1];
    expect(options.headers.apikey).toBe('public-key');
    expect(options.headers.Authorization).toBeUndefined();
    expect(JSON.parse(options.body)).toEqual({ email: input.email, password: input.password, data: { nombre_completo: input.name, registration_source: 'eva-participant' } });
    expect(JSON.stringify(fetch.mock.calls)).not.toContain(env.supabaseSecretKey);
  });
  it('allows external signup with a personal email', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(settings()).mockResolvedValueOnce(json({ id: 'auth-id' }));
    vi.stubGlobal('fetch', fetch);
    await expect(registrationService.register({ ...input, participantKind: 'EXTERNAL', email: 'ana@example.test' })).resolves.toHaveProperty('message');
  });
  it.each([{ mailer_autoconfirm: true }, { mailer_autoconfirm: true, autoconfirm: false }, {}, { disable_signup: true, mailer_autoconfirm: false }, { external: { email: false }, mailer_autoconfirm: false }])('blocks unsafe or disabled settings %j before sending signup', async config => {
    const fetch = vi.fn().mockResolvedValue(json(config)); vi.stubGlobal('fetch', fetch);
    await expect(registrationService.register(input)).rejects.toMatchObject({ statusCode: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects an unexpected automatically confirmed session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(settings()).mockResolvedValueOnce(json({ access_token: 'never-expose' })));
    await expect(registrationService.register(input)).rejects.toMatchObject({ statusCode: 503 });
  });
  it.each(['user_already_exists', 'email_exists'])('does not disclose a duplicate address (%s)', async code => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(settings()).mockResolvedValueOnce(json({ code }, 422)));
    await expect(registrationService.register(input)).resolves.toHaveProperty('message');
  });
  it('resends only a signup confirmation to the configured destination', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(settings()).mockResolvedValueOnce(json({})); vi.stubGlobal('fetch', fetch);
    await registrationService.resend({ email: ' Ana@Example.test ' });
    expect(fetch.mock.calls[1]?.[0]).toContain('/resend?redirect_to=');
    expect(JSON.parse(fetch.mock.calls[1]?.[1].body)).toEqual({ type: 'signup', email: 'ana@example.test' });
  });
  it.each(['https://evil.test/other', 'javascript:alert(1)', 'https://example.test/confirmar-correo?next=https://evil.test'])('rejects an invalid configured redirect %s', async redirect => {
    env.authEmailRedirectUrl = redirect; const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(registrationService.register(input)).rejects.toMatchObject({ statusCode: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([429, 500])('sanitizes provider failure %s', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(settings()).mockResolvedValueOnce(json({ message: input.password }, status)));
    await expect(registrationService.register(input)).rejects.toMatchObject({ statusCode: status === 429 ? 429 : 503, message: expect.not.stringContaining(input.password) });
  });
  it('sanitizes transport failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(input.password)));
    await expect(registrationService.register(input)).rejects.toMatchObject({ statusCode: 503, message: expect.not.stringContaining(input.password) });
  });
});
