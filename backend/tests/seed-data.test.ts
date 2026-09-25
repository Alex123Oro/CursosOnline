import { describe, expect, it } from 'vitest';
import { courseInputSchema } from '../src/modules/courses/course.rules.js';
import { SEED_COURSES } from '../prisma/seed-data.js';

describe('course seed data', () => {
  it('provides six unique published courses for Informática y Sistemas', () => {
    expect(SEED_COURSES).toHaveLength(6);
    expect(new Set(SEED_COURSES.map(course => course.code)).size).toBe(6);
    expect(SEED_COURSES.every(course => course.status === 'PUBLISHED')).toBe(true);
  });

  it('satisfies the existing course rules and publication requirements', () => {
    for (const course of SEED_COURSES) {
      expect(courseInputSchema.safeParse(course).success).toBe(true);
      expect(course.approvalCriteria).toContain('70/100');
      expect(course.approvalCriteria).toContain('80%');
      expect(new Date(course.endDate).getTime()).toBeGreaterThan(new Date(course.startDate).getTime());
    }
  });
});
