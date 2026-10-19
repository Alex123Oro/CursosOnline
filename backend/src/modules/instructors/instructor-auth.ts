import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { HttpError } from '../../shared/http-error.js';

const unavailable = () => new HttpError(503, 'El servicio de acceso no está disponible.');
const adminClient = () => {
  if (!env.supabaseUrl || !env.supabaseSecretKey) throw unavailable();
  try {
    return createClient(env.supabaseUrl, env.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, options = {}) => {
        const timeout = AbortSignal.timeout(15000);
        const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
        return fetch(url, { ...options, signal });
      } }
    }).auth.admin;
  } catch { throw unavailable(); }
};
const authFailure = (error: unknown) => {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (code === 'email_exists' || code === 'user_already_exists') {
    return new HttpError(409, 'El correo ya está registrado.', [{ path: 'email', message: 'El correo ya está registrado.' }]);
  }
  if (code === 'weak_password') {
    return new HttpError(400, 'La contraseña no cumple los requisitos de seguridad.',
      [{ path: 'password', message: 'Use una contraseña más segura.' }]);
  }
  return unavailable();
};

export const instructorAuth = {
  async createIdentity(input: { name: string; email: string; password: string }): Promise<string> {
    const admin = adminClient();
    const authId = randomUUID();
    const reconcile = async () => {
      try {
        const { data, error } = await admin.getUserById(authId);
        if (!error && data.user?.id === authId && data.user.email?.toLowerCase() === input.email) return authId;
      } catch { /* The outcome stays unresolved; never search or delete by email. */ }
      console.error('instructor_identity_creation_unresolved', { authId });
      throw unavailable();
    };
    const handleFailure = (error: unknown) => {
      const failure = authFailure(error);
      const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
      if (failure.statusCode !== 503 || (typeof status === 'number' && status >= 400 && status < 500)) throw failure;
      return reconcile();
    };
    let result;
    try {
      result = await admin.createUser({ id: authId, email: input.email, password: input.password,
        email_confirm: true, user_metadata: { name: input.name } });
    } catch (error) { return handleFailure(error); }
    if (result.error) return handleFailure(result.error);
    if (result.data?.user?.id !== authId || result.data.user.email?.toLowerCase() !== input.email) return reconcile();
    return authId;
  },
  async deleteIdentity(authId: string): Promise<void> {
    const admin = adminClient();
    try {
      const { error } = await admin.deleteUser(authId);
      if (error) throw unavailable();
    } catch { throw unavailable(); }
  }
};
