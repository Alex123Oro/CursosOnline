import { z } from 'zod';
const positiveId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);
export const enrollmentQuerySchema = z.object({
  courseId: positiveId,
  status: z.enum(['PREINSCRITO', 'INSCRITO', 'CANCELADO', 'RECHAZADO', 'CADUCADO']),
  page: positiveId.optional().default(1),
  search: z.string().trim().max(100).optional().default(''),
});
export type EnrollmentQuery = z.infer<typeof enrollmentQuerySchema>;
