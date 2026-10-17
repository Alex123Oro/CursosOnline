import { env } from '../../config/env.js';
import { HttpError } from '../../shared/http-error.js';

export const certificateLink = (code: string): string => {
  try {
    if (!env.publicAppUrl) throw new Error('missing public URL');
    const base = new URL(env.publicAppUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash
      || (env.nodeEnv === 'production' && base.protocol !== 'https:')) throw new Error('invalid public URL');
    return `${base.toString().replace(/\/$/, '')}/verificar/${code}`;
  } catch {
    throw new HttpError(503, 'La dirección pública de verificación no está configurada correctamente.');
  }
};
