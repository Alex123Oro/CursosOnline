import { vi } from 'vitest';

// Only HTTP contract tests use these identities; the runtime always calls Supabase.
vi.mock('../../src/modules/auth/auth.service.js', () => ({
  verifyAccessToken: vi.fn(async (token: string) => /^\d+$/.test(token) ? { id: token } : null)
}));
