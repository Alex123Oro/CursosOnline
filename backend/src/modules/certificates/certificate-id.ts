import { HttpError } from '../../shared/http-error.js';

// PostgREST may serialize bigint as JSON numbers. Fail closed if precision was
// already lost rather than authorize or link to a different record.
export const certificateDatabaseId = (value: unknown): string => {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new HttpError(503, 'El identificador recibido excede la precisión admitida.');
  }
  if (!['number', 'string'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value))) {
    throw new HttpError(503, 'El identificador recibido no es válido.');
  }
  return String(value);
};
