import { z } from 'zod';
import { HttpError } from '../../shared/http-error.js';

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

const hasDateOrder = (startDate?: string | null, endDate?: string | null) => {
  if (!startDate || !endDate) {
    return true;
  }

  return Date.parse(endDate) >= Date.parse(startDate);
};

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
    throw new HttpError(400, 'No se puede publicar un curso sin instructor, horario o fechas definidas.');
  }

  if (!hasDateOrder(course.startDate, course.endDate)) {
    throw new HttpError(400, 'La fecha de fin no puede ser anterior a la fecha de inicio.');
  }

  return true;
};

export const courseInputSchema = z
  .object({
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
    startDate: dateStringSchema,
    endDate: dateStringSchema
  })
  .refine(course => hasDateOrder(course.startDate, course.endDate), {
    message: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
    path: ['endDate']
  });

export type CourseInput = z.infer<typeof courseInputSchema>;
