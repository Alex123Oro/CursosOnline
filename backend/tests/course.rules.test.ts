import { describe, expect, it } from 'vitest';
import { canPublishCourse, courseInputSchema } from '../src/modules/courses/course.rules.js';
import { isPreinscriptionOpen } from '../src/modules/courses/course.rules.js';
import { vi } from 'vitest';

describe('course rules (HU-01)', () => {
  it('validates minimum enrollment against the course capacity', () => {
    const data = { name: 'Curso de seguridad', content: 'Contenido del curso de seguridad', durationHours: 12,
      instructor: 'Carla', schedule: 'Martes 18:00', approvalCriteria: 'Proyecto final', capacity: 20 };
    expect(courseInputSchema.parse({ ...data, minimumEnrollment: 5 }).minimumEnrollment).toBe(5);
    expect(courseInputSchema.safeParse({ ...data, minimumEnrollment: 20 }).success).toBe(true);
    for (const minimumEnrollment of [0, -1, 1.5, 21]) {
      expect(courseInputSchema.safeParse({ ...data, minimumEnrollment }).success).toBe(false);
    }
  });
  it('acepta un curso valido y rechaza duracion invalida', () => {
    expect(() => courseInputSchema.parse({
      name: 'Curso de seguridad',
      content: 'Contenido de seguridad para personal administrativo',
      durationHours: 12,
      instructor: 'Ana Lopez',
      schedule: 'Martes y jueves 18:00-20:00',
      approvalCriteria: 'Proyecto final'
    })).not.toThrow();

    expect(() => courseInputSchema.parse({
      name: 'Curso invalido',
      content: 'Contenido de prueba',
      durationHours: 0,
      instructor: 'Ana Lopez',
      schedule: 'Martes y jueves',
      approvalCriteria: 'Proyecto final'
    })).toThrow();
  });

  it('rechaza un curso con campos obligatorios faltantes', () => {
    expect(() => courseInputSchema.parse({
      name: 'Curso incompleto',
      durationHours: 10
    })).toThrow();
  });
});

describe('course rules (HU-02)', () => {
  it('keeps enrollment open until midnight in Bolivia, not midnight UTC', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-23T01:00:00Z'));
      expect(isPreinscriptionOpen('2026-10-22','2026-10-22')).toBe(true);
      vi.setSystemTime(new Date('2026-10-23T04:00:00Z'));
      expect(isPreinscriptionOpen('2026-10-22','2026-10-22')).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it('permite publicar cuando el curso tiene instructor, horario y fechas completas', () => {
    expect(() => canPublishCourse({
      instructor: 'Ana Lopez',
      schedule: 'Martes y jueves 18:00-20:00',
      startDate: '2026-10-01',
      endDate: '2026-11-15',
      capacity: 20,
      preinscriptionStart: '2026-09-01',
      preinscriptionEnd: '2026-09-30'
    })).not.toThrow();
  });

  it('impide publicar cuando faltan instructor, horario o fechas', () => {
    expect(() => canPublishCourse({
      instructor: '',
      schedule: '',
      startDate: null,
      endDate: null
    })).toThrow('No se puede publicar un curso sin instructor, horario, fechas, capacidad o periodo de preinscripcion.');
  });
});
