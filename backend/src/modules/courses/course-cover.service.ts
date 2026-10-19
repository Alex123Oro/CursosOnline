import { randomUUID } from 'node:crypto';
import { getServerSupabase } from '../../config/supabase.js';
import { HttpError } from '../../shared/http-error.js';

export const COURSE_COVER_BUCKET = 'course-covers';
export function validateCoverUpload(body: unknown, contentType: string): { bytes: Buffer; extension: string } {
  if (!Buffer.isBuffer(body) || !body.length) throw new HttpError(400, 'Selecciona una imagen PNG, JPEG o WebP.');
  if (body.length > 5 * 1024 * 1024) throw new HttpError(413, 'La portada no debe superar 5 MB.');
  const type = (contentType.split(';')[0] ?? '').trim().toLowerCase();
  const valid = type === 'image/png' ? body.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : type === 'image/jpeg' ? body[0] === 255 && body[1] === 216 && body[2] === 255
    : type === 'image/webp' ? body.toString('ascii',0,4) === 'RIFF' && body.toString('ascii',8,12) === 'WEBP' : false;
  if (!valid) throw new HttpError(400, 'El archivo debe ser una imagen PNG, JPEG o WebP válida.');
  return { bytes: body, extension: type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp' };
}
export const courseCoverService = {
  async upload(body: unknown, contentType: string, actorId: number) {
    const { bytes, extension } = validateCoverUpload(body, contentType);
    const storage = getServerSupabase().storage;
    const { data: bucket, error: lookupError } = await storage.getBucket(COURSE_COVER_BUCKET);
    if (!bucket) {
      if (lookupError && !/not found/i.test(lookupError.message)) throw new HttpError(503, 'No se pudo acceder al almacenamiento de portadas.');
      const { error } = await storage.createBucket(COURSE_COVER_BUCKET, { public: true, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ['image/png','image/jpeg','image/webp'] });
      if (error && !/already exists/i.test(error.message)) throw new HttpError(503, 'No se pudo preparar el almacenamiento de portadas.');
    }
    const path = `${actorId}/${randomUUID()}.${extension}`;
    const { error } = await storage.from(COURSE_COVER_BUCKET).upload(path, bytes, { contentType: (contentType.split(';')[0] ?? '').trim().toLowerCase(), upsert: false, cacheControl: '31536000' });
    if (error) throw new HttpError(503, 'No se pudo subir la portada. Inténtalo nuevamente.');
    return { coverUrl: storage.from(COURSE_COVER_BUCKET).getPublicUrl(path).data.publicUrl };
  }
};
