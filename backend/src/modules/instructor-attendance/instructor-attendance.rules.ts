import { z } from 'zod';
import { HttpError } from '../../shared/http-error.js';
import type { RequestUser } from '../../shared/auth.js';
const date = z.string().refine(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'La fecha no es válida.');
export const instructorAttendanceFilters = z.object({
  courseId: z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger).optional(),
  from: date.optional(), to: date.optional()
}).refine(value => !value.from || !value.to || value.from <= value.to, { path: ['to'], message: 'Hasta debe ser igual o posterior a Desde.' });
export type InstructorAttendanceFilters = z.infer<typeof instructorAttendanceFilters>;
export const requireAdministrator = (user: RequestUser) => { if (user.role !== 'ADMIN') throw new HttpError(403, 'Solo el administrador puede gestionar asistencia de instructores.'); };
