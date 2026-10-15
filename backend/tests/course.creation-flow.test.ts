import { describe, expect, it } from 'vitest';
import { courseInputSchema, canPublishCourse } from '../src/modules/courses/course.rules.js';
import { summarizeSessions } from '../src/modules/course-sessions/course-session.rules.js';

describe('course creation and class planning', () => {
  it('accepts a draft before its classes define the schedule', () => {
    expect(courseInputSchema.safeParse({ name: 'Curso nuevo', content: 'Contenido del curso', durationHours: 12,
      instructor: 'Carla', approvalCriteria: 'Proyecto final', capacity: 20 }).success).toBe(true);
    expect(() => canPublishCourse({ instructor: 'Carla', schedule: '', capacity: 20 })).toThrow();
  });
  it('summarizes real classes by weekday and time, without repeating weekly dates', () => {
    expect(summarizeSessions([
      { date: new Date('2026-10-12'), startTime: '18:00', durationMinutes: 90 },
      { date: new Date('2026-10-19'), startTime: '18:00', durationMinutes: 90 },
      { date: new Date('2026-10-14'), startTime: '19:00', durationMinutes: 60 }
    ])).toBe('Lun 18:00–19:30 · Mié 19:00–20:00');
    expect(summarizeSessions([])).toBe('');
  });
});
