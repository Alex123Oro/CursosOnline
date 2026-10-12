import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

const supabaseApiKey = env.supabaseSecretKey ?? env.supabasePublishableKey;

export const supabase: SupabaseClient | null =
  env.supabaseUrl && supabaseApiKey
    ? createClient(env.supabaseUrl, supabaseApiKey)
    : null;
