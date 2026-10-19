import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn(), getUserById: vi.fn(), env: { supabaseUrl: 'https://test.supabase.co', supabaseSecretKey: 'secret', supabasePublishableKey: 'public' } as Record<string, string | undefined> }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../src/config/env.js', () => ({ env: mocks.env }));
import { instructorAuth } from '../src/modules/instructors/instructor-auth.js';
const input = { name: 'Ana', email: 'ana@example.com', password: ' 1234567890 ' };
describe('instructor administrative Auth', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  beforeEach(() => { vi.resetAllMocks(); mocks.env.supabaseUrl = 'https://test.supabase.co'; mocks.env.supabaseSecretKey = 'secret'; mocks.createClient.mockReturnValue({ auth: { admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser, getUserById: mocks.getUserById } } }); mocks.createUser.mockImplementation(async ({ id, email }) => ({ data: { user: { id, email } }, error: null })); mocks.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 404 } }); mocks.deleteUser.mockResolvedValue({ error: null }); });
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
  it('uses only a server secret, disables sessions and confirms email', async () => {
    const id = await instructorAuth.createIdentity(input); expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.createClient).toHaveBeenCalledWith('https://test.supabase.co', 'secret', expect.objectContaining({ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
    expect(mocks.createUser).toHaveBeenCalledWith({ id: expect.any(String), email: input.email, password: input.password, email_confirm: true, user_metadata: { name: input.name } });
  });
  it('bounds Auth requests with a timeout while preserving caller cancellation', async () => {
    await instructorAuth.createIdentity(input);
    const options = mocks.createClient.mock.calls[0]?.[2];
    expect(options.global?.fetch).toBeTypeOf('function');
    const timeout = vi.spyOn(AbortSignal, 'timeout'); const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    try {
      const controller = new AbortController(); controller.abort();
      await options.global.fetch('https://test.supabase.co/auth/v1/admin/users', { signal: controller.signal });
      expect(timeout).toHaveBeenCalledWith(15000); expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    } finally { timeout.mockRestore(); transport.mockRestore(); }
  });
  it.each(['supabaseUrl', 'supabaseSecretKey'])('rejects missing %s without a publishable key fallback', async field => { mocks.env[field] = undefined; await expect(instructorAuth.createIdentity(input)).rejects.toMatchObject({ statusCode: 503 }); expect(mocks.createClient).not.toHaveBeenCalled(); });
  it.each(['email_exists', 'user_already_exists'])('maps duplicate Auth code %s to email conflict', async code => { mocks.createUser.mockResolvedValue({ error: { code, message: input.password }, data: { user: null } }); await expect(instructorAuth.createIdentity(input)).rejects.toMatchObject({ statusCode: 409, fields: [{ path: 'email', message: expect.any(String) }] }); });
  it('maps weak passwords to a safe field error', async () => { mocks.createUser.mockResolvedValue({ error: { code: 'weak_password', status: 422, message: input.password } }); await expect(instructorAuth.createIdentity(input)).rejects.toMatchObject({ statusCode: 400, fields: [{ path: 'password', message: expect.not.stringContaining(input.password) }] }); });
  it.each([{ code: 'unexpected_failure', status: 500 }, { status: 401 }, { status: 403 }, { status: 429 }, { status: 400 }, { code: 'validation_failed', status: 422 }])('maps unavailable or invalid configuration %j to safe 503', async error => { mocks.createUser.mockResolvedValue({ error: { ...error, message: input.password } }); await expect(instructorAuth.createIdentity(input)).rejects.toMatchObject({ statusCode: 503, message: expect.not.stringContaining(input.password) }); });
  it('sanitizes thrown provider and client configuration errors', async () => { mocks.createUser.mockRejectedValue(new Error(input.password)); await expect(instructorAuth.createIdentity(input)).rejects.toMatchObject({ statusCode: 503 }); mocks.createClient.mockImplementation(() => { throw new Error(input.password); }); await expect(instructorAuth.createIdentity(input)).rejects.toMatchObject({ statusCode: 503 }); });
  it('rejects a missing identity id', async () => { mocks.createUser.mockResolvedValue({ data: { user: null }, error: null }); await expect(instructorAuth.createIdentity(input)).rejects.toMatchObject({ statusCode: 503 }); });
  it('deletes exactly the supplied newly created identity', async () => { await instructorAuth.deleteIdentity('new-auth'); expect(mocks.deleteUser).toHaveBeenCalledWith('new-auth'); });
  it.each(['transport', 'timeout', 'server', 'missing'])('reconciles %s using only the generated UUID', async failure => {
    let generated = '';
    mocks.createUser.mockImplementation(async ({ id }) => { generated = id; if (failure === 'transport' || failure === 'timeout') throw new Error(input.password); if (failure === 'server') return { error: { status: 500 } }; return { data: { user: null }, error: null }; });
    mocks.getUserById.mockImplementation(async id => ({ data: { user: { id, email: input.email } }, error: null }));
    expect(await instructorAuth.createIdentity(input)).toBe(generated); expect(generated).toMatch(/^[0-9a-f-]{36}$/); expect(mocks.getUserById).toHaveBeenCalledWith(generated); expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it('records only the generated UUID when reconciliation is unresolved', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { mocks.createUser.mockRejectedValue(new Error(input.password)); mocks.getUserById.mockRejectedValue(new Error(input.password)); await expect(instructorAuth.createIdentity(input)).rejects.toMatchObject({ statusCode: 503 }); const id = mocks.createUser.mock.calls[0]?.[0].id; expect(log.mock.calls).toEqual([['instructor_identity_creation_unresolved', { authId: id }]]); expect(mocks.deleteUser).not.toHaveBeenCalled(); } finally { log.mockRestore(); }
  });
  it('never adopts a provider identity with an unrelated id or email', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { mocks.createUser.mockResolvedValue({ data: { user: { id: 'existing', email: input.email } }, error: null }); mocks.getUserById.mockImplementation(async id => ({ data: { user: { id, email: 'other@example.com' } }, error: null })); await expect(instructorAuth.createIdentity(input)).rejects.toMatchObject({ statusCode: 503 }); expect(mocks.deleteUser).not.toHaveBeenCalled(); } finally { log.mockRestore(); }
  });
  it('reports cleanup failure without provider payload', async () => { mocks.deleteUser.mockResolvedValue({ error: { message: input.password } }); await expect(instructorAuth.deleteIdentity('new-auth')).rejects.toMatchObject({ statusCode: 503, message: expect.not.stringContaining(input.password) }); });
});
