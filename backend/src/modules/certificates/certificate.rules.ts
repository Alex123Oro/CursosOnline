import { z } from 'zod';
import { certificateTemplateSnapshotSchema } from './certificate-template.rules.js';

// Keep bigint identifiers as decimal strings throughout this module.
export const certificateIdSchema = z.string().regex(/^[1-9]\d*$/, 'El identificador no es válido.')
  .refine(value => /^[1-9]\d*$/.test(value) && value.length <= 19 && BigInt(value) <= 9223372036854775807n, 'El identificador no es válido.');
export const certificateCodeSchema = z.string().trim().toUpperCase()
  .regex(/^[0-9A-F]{8}$/, 'El código debe contener ocho caracteres hexadecimales.');
export const certificateTypeSchema = z.enum(['aprobacion', 'participacion']);
export const certificateInputSchema = z.strictObject({
  enrollmentId: certificateIdSchema,
  type: certificateTypeSchema.default('aprobacion'),
  templateId: certificateIdSchema.optional()
});
export const certificateBulkSchema = z.strictObject({
  type: certificateTypeSchema.default('aprobacion'),
  templateId: certificateIdSchema.optional(),
  enrollmentIds: z.array(certificateIdSchema).min(1).max(100)
    .refine(ids => new Set(ids).size === ids.length, 'Las inscripciones no pueden repetirse.')
});
export const certificateSnapshotSchema = z.object({
  participantName: z.string().trim().min(1),
  courseName: z.string().trim().min(1),
  durationHours: z.number().positive(),
  version: z.literal(1),
  demo: z.boolean().optional(),
  template: certificateTemplateSnapshotSchema.optional()
});
