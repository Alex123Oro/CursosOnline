import 'dotenv/config';

const parseOrigins = (value: string) =>
  value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PUERTO ?? 3000),
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN ?? 'http://localhost:4200'),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseJwksUrl: process.env.SUPABASE_JWKS_URL,
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  publicAppUrl: process.env.PUBLIC_APP_URL,
  pdfSigningPath: process.env.PDF_SIGNING_P12_PATH,
  pdfSigningPassword: process.env.PDF_SIGNING_P12_PASSWORD,
  pdfSigningDemo: process.env.PDF_SIGNING_DEMO === 'true',
  certificateVerificationLimit: Number(process.env.CERTIFICATE_VERIFICATION_LIMIT ?? 30),
  certificateVerificationWindowMs: Number(process.env.CERTIFICATE_VERIFICATION_WINDOW_MS ?? 60000)
};
