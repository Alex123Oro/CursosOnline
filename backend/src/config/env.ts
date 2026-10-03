import 'dotenv/config';

const parseOrigins = (value: string) =>
  value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

export const env = {
  port: Number(process.env.PUERTO ?? 3000),
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN ?? 'http://localhost:4200'),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY
};
