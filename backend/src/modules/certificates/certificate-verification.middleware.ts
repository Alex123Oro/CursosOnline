import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';

const positive = (value: number, fallback: number) => Number.isSafeInteger(value) && value > 0 ? value : fallback;
export const certificateVerificationLimiter = rateLimit({
  windowMs: positive(env.certificateVerificationWindowMs, 60000),
  limit: positive(env.certificateVerificationLimit, 30),
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message: 'Demasiadas verificaciones. Inténtalo más tarde.', fields: [] }
});
