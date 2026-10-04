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

export const toDateOnly = (value: Date | string) => {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
};

export const todayDateOnly = () => toDateOnly(new Date());

export const isPreinscriptionOpen = (startDate?: string | Date | null, endDate?: string | Date | null, today = todayDateOnly()) => {
  if (!startDate || !endDate) {
    return false;
  }

  const start = toDateOnly(startDate);
  const end = toDateOnly(endDate);
  return today >= start && today <= end;
};

export type CoursePublicationContext = {
  instructor?: string | null;
  schedule?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  capacity?: number | null;
  preinscriptionStart?: string | null;
  preinscriptionEnd?: string | null;
};

export const canPublishCourse = (course: CoursePublicationContext) => {
  const hasRequiredData = Boolean(
    course.instructor?.trim() &&
    course.schedule?.trim() &&
    course.startDate &&
    course.endDate &&
    course.capacity &&
    course.preinscriptionStart &&
    course.preinscriptionEnd
  );

  if (!hasRequiredData) {
    throw new HttpError(400, 'No se puede publicar un curso sin instructor, horario, fechas, capacidad o periodo de preinscripcion.');
  }

  if (!hasDateOrder(course.startDate, course.endDate)) {
    throw new HttpError(400, 'La fecha de fin no puede ser anterior a la fecha de inicio.');
  }

  if (!hasDateOrder(course.preinscriptionStart, course.preinscriptionEnd)) {
    throw new HttpError(400, 'La fecha de fin de preinscripcion no puede ser anterior a la de inicio.');
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
    approvalCriteria: z.string().trim().optional(),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    capacity: z.preprocess(
      value => (value === '' || value === null || value === undefined ? null : value),
      z.coerce.number({ error: 'La capacidad es obligatoria.' }).int('La capacidad debe ser un numero entero.').positive('La capacidad debe ser mayor a 0.').nullable()
    ),
    preinscriptionStart: dateStringSchema,
    preinscriptionEnd: dateStringSchema
  })
  .refine(course => hasDateOrder(course.startDate, course.endDate), {
    message: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
    path: ['endDate']
  })
  .refine(course => hasDateOrder(course.preinscriptionStart, course.preinscriptionEnd), {
    message: 'La fecha de fin de preinscripcion no puede ser anterior a la de inicio.',
    path: ['preinscriptionEnd']
  });

export type CourseInput = z.infer<typeof courseInputSchema>;

export const coursePricesSchema = z.object({
  items: z
    .array(z.object({
      participantTypeId: z.coerce.number({ error: 'El tipo de participante es obligatorio.' }).int().positive(),
      basePrice: z.coerce
        .number({ error: 'El precio es obligatorio.' })
        .min(0, 'El precio no puede ser negativo.')
    }))
    .min(1, 'Debe configurar al menos un precio.')
});

export type CoursePricesInput = z.infer<typeof coursePricesSchema>;

export const scholarshipSchema = z.object({
  scholarshipPercent: z.coerce
    .number({ error: 'El porcentaje de beca es obligatorio.' })
    .min(0, 'El porcentaje de beca debe estar entre 0 % y 100 %.')
    .max(100, 'El porcentaje de beca debe estar entre 0 % y 100 %.')
});

export type ScholarshipInput = z.infer<typeof scholarshipSchema>;

export const paymentSchema = z.object({
  amount: z.coerce
    .number({ error: 'El monto es obligatorio.' })
    .min(0, 'El monto no puede ser negativo.')
    .optional()
});

export const parsePositiveInt = (value: string | string[] | undefined, message: string) => {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);

  if (!raw || !Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, message);
  }

  return parsed;
};
