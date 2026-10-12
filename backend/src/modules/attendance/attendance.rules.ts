import { z } from 'zod';

export const attendanceInputSchema = z.object({ status: z.enum(['PRESENT', 'ABSENT']) });
export const boliviaToday = (date = new Date(Date.now())) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date);
