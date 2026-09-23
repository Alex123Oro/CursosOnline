import { z } from 'zod';

const requiredText = (field: string, minLength = 1) =>
  z
    .string({ error: `${field} es obligatorio.` })
    .trim()
    .min(minLength, `${field} es obligatorio.`);

const dateStringSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine(value => !value || !Number.isNaN(Date.parse(value)), {
    message: 'La fecha no es valida.'
  });

export const courseStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);

export type CourseStatus = z.infer<typeof courseStatusSchema>;

export type CoursePublicationContext = {
  instructor?: string | null;
  schedule?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export const canPublishCourse = (course: CoursePublicationContext) => {
  const hasRequiredData = Boolean(
    course.instructor?.trim() &&
    course.schedule?.trim() &&
    course.startDate &&
    course.endDate
  );

  if (!hasRequiredData) {
    throw new Error('No se puede publicar un curso sin instructor, horario o fechas definidas.');
  }

  return true;
};

export const courseInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'El codigo no puede estar vacio.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  name: requiredText('El nombre', 3),
  content: requiredText('El contenido', 10),
  durationHours: z.coerce
    .number({ error: 'Las horas son obligatorias.' })
    .int('Las horas deben ser un numero entero.')
    .positive('Las horas deben ser mayores a 0.'),
  instructor: requiredText('El instructor', 2),
  schedule: requiredText('El horario', 3),
  approvalCriteria: requiredText('Los criterios de aprobacion', 3),
  status: courseStatusSchema.default('DRAFT').optional(),
  startDate: dateStringSchema,
  endDate: dateStringSchema
});

export type CourseInput = z.infer<typeof courseInputSchema>;
