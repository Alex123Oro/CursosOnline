import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../../shared/http-error.js';
import { certificateLink } from './certificate-link.js';
import { CertificateCodeCollision, certificateRepository } from './certificate.repository.js';
import { certificateSnapshotSchema } from './certificate.rules.js';
import type { Certificate } from './certificate.types.js';
import { certificateDatabaseId } from './certificate-id.js';

const recordSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(certificateDatabaseId),
  codigo_verificacion: z.string().regex(/^[0-9A-F]{8}$/),
  tipo: z.enum(['aprobacion', 'participacion']),
  fecha_emision: z.string(), estado: z.enum(['valido', 'anulado']),
  datos_emision: certificateSnapshotSchema,
  anulaciones_certificados: z.preprocess(
    value => value == null ? [] : Array.isArray(value) ? value : [value],
    z.array(z.object({ id: z.union([z.string(), z.number()]) }))
  )
});

const toCertificate = (raw: unknown): Certificate => {
  const parsed = recordSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(503, 'Los datos del certificado están incompletos. Contacta con administración.');
  const row = parsed.data;
  return {
    id: row.id, code: row.codigo_verificacion,
    participantName: row.datos_emision.participantName, courseName: row.datos_emision.courseName,
    durationHours: row.datos_emision.durationHours, type: row.tipo, issuedAt: row.fecha_emision,
    status: row.estado === 'anulado' || row.anulaciones_certificados.length ? 'REVOKED' : 'VALID',
    publicUrl: certificateLink(row.codigo_verificacion),
    ...(row.datos_emision.demo ? { demo: true } : {}),
    ...(row.datos_emision.template ? { template: row.datos_emision.template } : {})
  };
};

export const certificateService = {
  courses: () => certificateRepository.courses(),
  roster: (courseId: string, type: Certificate['type'] = 'aprobacion') => certificateRepository.roster(courseId, type),
  async issue(enrollmentId: string, actorId: string, type: Certificate['type'] = 'aprobacion', templateId?: string): Promise<Certificate> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomBytes(4).toString('hex').toUpperCase();
      try {
        return toCertificate(await certificateRepository.issue(enrollmentId, code, certificateLink(code), actorId, type, ...(templateId ? [templateId] : [])));
      } catch (error) {
        if (!(error instanceof CertificateCodeCollision)) throw error;
      }
    }
    throw new HttpError(409, 'No se pudo generar un código único. Inténtalo nuevamente.');
  },
  async bulk(courseId: string, enrollmentIds: string[], actorId: string, type: Certificate['type'] = 'aprobacion', templateId?: string) {
    const roster = await certificateRepository.roster(courseId, type);
    const allowed = new Set(roster.students.map(row => row.enrollmentId));
    if (enrollmentIds.some(id => !allowed.has(id))) throw new HttpError(400, 'Una inscripción no pertenece a este curso.');
    const issued: Certificate[] = [];
    const failed: { enrollmentId: string; message: string }[] = [];
    for (const id of enrollmentIds) {
      try { issued.push(await certificateService.issue(id, actorId, type, ...(templateId ? [templateId] : []))); }
      catch (error) {
        if (!(error instanceof HttpError) || ![400, 404, 409].includes(error.statusCode)) throw error;
        failed.push({ enrollmentId: id, message: error.message });
      }
    }
    return { issued, failed };
  },
  async verify(code: string) {
    const raw = await certificateRepository.verify(code);
    if (!raw) throw new HttpError(404, 'Certificado no válido o inexistente');
    const certificate = toCertificate(raw);
    if (certificate.status === 'REVOKED') return { status: 'REVOKED' as const, message: 'Certificado anulado', code };
    // Explicit public DTO: do not spread the database row or the private DTO.
    return {
      status: 'VALID' as const, message: 'Certificado válido', code: certificate.code,
      participantName: certificate.participantName, courseName: certificate.courseName,
      durationHours: certificate.durationHours, type: certificate.type, issuedAt: certificate.issuedAt
    };
  },
  async mine(participantId: string) { return (await certificateRepository.mine(participantId)).map(toCertificate); },
  async owned(id: string, participantId: string) {
    const raw = await certificateRepository.owned(id, participantId);
    if (!raw) throw new HttpError(404, 'Certificado no encontrado.');
    return toCertificate(raw);
  },
  async downloadable(id: string, participantId: string) {
    const certificate = await certificateService.owned(id, participantId);
    if (certificate.status !== 'VALID') throw new HttpError(409, 'El certificado está anulado y no se puede descargar.');
    return certificate;
  }
};
