import { describe, expect, it } from 'vitest';
import { sessionInputSchema, periodWarning, endTime } from '../src/modules/course-sessions/course-session.rules.js';

const input = { date: '2026-10-12', startTime: '19:00', durationMinutes: 120 };
describe('session rules', () => {
  it('accepts a valid session and calculates its end time', () => {
    expect(sessionInputSchema.parse(input)).toEqual(input);
    expect(endTime('19:00', 120)).toBe('21:00');
  });
  it.each(['2026-02-30', '2026-13-01', '2026-1-02', 'invalid'])('rejects impossible date %s', date => {
    expect(sessionInputSchema.safeParse({ ...input, date }).success).toBe(false);
  });
  it.each(['24:00', '12:60', '9:00', ''])('rejects invalid time %s', startTime => {
    expect(sessionInputSchema.safeParse({ ...input, startTime }).success).toBe(false);
  });
  it.each([0, -1, 1.5, 301, null, '120'])('rejects invalid duration %s', durationMinutes => {
    expect(sessionInputSchema.safeParse({ ...input, durationMinutes }).success).toBe(false);
  });
  it('requires the session to finish before midnight', () => {
    expect(sessionInputSchema.safeParse({ ...input, startTime: '23:00', durationMinutes: 60 }).success).toBe(false);
    expect(sessionInputSchema.safeParse({ ...input, startTime: '23:00', durationMinutes: 59 }).success).toBe(true);
  });
  it('warns outside the period but accepts its inclusive boundaries', () => {
    expect(periodWarning('2026-10-11', '2026-10-12', '2026-11-12')).toBeTruthy();
    expect(periodWarning('2026-11-13', '2026-10-12', '2026-11-12')).toBeTruthy();
    expect(periodWarning('2026-10-12', '2026-10-12', '2026-11-12')).toBeNull();
    expect(periodWarning('2026-11-12', '2026-10-12', '2026-11-12')).toBeNull();
  });
});
