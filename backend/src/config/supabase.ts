import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { HttpError } from '../shared/http-error.js';

const supabaseApiKey = env.supabaseSecretKey ?? env.supabasePublishableKey;

export const supabase: SupabaseClient | null =
  env.supabaseUrl && supabaseApiKey
    ? createClient(env.supabaseUrl, supabaseApiKey)
    : null;

let serverClient: SupabaseClient | undefined;

// Privileged data access is backend-only. Never fall back to an anonymous key.
export const getServerSupabase = (): SupabaseClient => {
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new HttpError(503, 'El servicio de certificados no está configurado.');
  }
  serverClient ??= createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options = {}) => fetch(url, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000)
    }) }
  });
  return serverClient;
};
