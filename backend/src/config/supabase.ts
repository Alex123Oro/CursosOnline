import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const urlSupabase = process.env.SUPABASE_URL;
const claveSecretaSupabase = process.env.SUPABASE_SECRET_KEY;

if (!urlSupabase || !claveSecretaSupabase) {
  throw new Error('Faltan las variables de entorno de Supabase');
}

export const supabase = createClient(
  urlSupabase,
  claveSecretaSupabase
);