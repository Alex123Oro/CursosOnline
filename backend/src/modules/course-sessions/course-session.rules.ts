import { z } from 'zod';

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

export const sessionInputSchema = z.object({
  date: z.string().refine(validDate, 'La fecha no es válida.'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora no es válida.'),
  durationMinutes: z.number().int('La duración debe ser un número entero.').positive('La duración debe ser mayor a 0.')
}).refine(value => minutes(value.startTime) + value.durationMinutes < 1440, {
  path: ['durationMinutes'], message: 'La sesión debe finalizar dentro del mismo día.'
});

export type SessionInput = z.infer<typeof sessionInputSchema>;
export const recurrenceDates = (input: { startDate: string; endDate: string; weekdays: number[] }) => {
  const dates: string[] = [];
  const cursor = new Date(input.startDate);
  const end = new Date(input.endDate);
  while (cursor <= end) {
    if (input.weekdays.includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};
export const recurrenceInputSchema = z.object({
  startDate: z.string().refine(validDate, 'La fecha de inicio no es válida.'),
  endDate: z.string().refine(validDate, 'La fecha de fin no es válida.'),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'Selecciona al menos un día.').max(7)
    .refine(days => new Set(days).size === days.length, 'Los días no pueden repetirse.'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora no es válida.'),
  durationMinutes: z.number().int().positive()
}).superRefine((value, context) => {
  if (minutes(value.startTime) + value.durationMinutes >= 1440) context.addIssue({ code: 'custom', path: ['durationMinutes'], message: 'La sesión debe finalizar dentro del mismo día.' });
  if (!validDate(value.startDate) || !validDate(value.endDate)) return;
  const span = (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86400000;
  if (span < 0 || span > 365) { context.addIssue({ code: 'custom', path: ['endDate'], message: 'El periodo debe ir desde la fecha de inicio hasta un máximo de 366 días.' }); return; }
  if (!recurrenceDates(value).length) context.addIssue({ code: 'custom', path: ['weekdays'], message: 'No hay fechas para los días seleccionados en este periodo.' });
});
export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;
export const endTime = (start: string, duration: number) => {
  const total = minutes(start) + duration;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
export const periodWarning = (date: string, start: string | null, end: string | null) =>
  (start && date < start) || (end && date > end)
    ? 'La fecha de la sesión está fuera del periodo del curso. Puedes guardarla igualmente.' : null;
