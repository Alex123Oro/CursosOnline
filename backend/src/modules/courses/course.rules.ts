import { z } from 'zod';

const requiredText = (field: string, minLength = 1) =>
  z
    .string({ error: `${field} es obligatorio.` })
    .trim()
    .min(minLength, `${field} es obligatorio.`);

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
  approvalCriteria: requiredText('Los criterios de aprobacion', 3)
});

export type CourseInput = z.infer<typeof courseInputSchema>;
