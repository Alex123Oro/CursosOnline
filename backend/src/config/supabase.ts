import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

export const supabase: SupabaseClient | null =
  env.supabaseUrl && env.supabaseSecretKey
    ? createClient(env.supabaseUrl, env.supabaseSecretKey)
    : null;
