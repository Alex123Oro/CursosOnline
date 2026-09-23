import { describe, expect, it } from 'vitest';
import { canPublishCourse, courseInputSchema } from '../src/modules/courses/course.rules.js';

describe('course rules (HU-01)', () => {
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
  it('permite publicar cuando el curso tiene instructor, horario y fechas completas', () => {
    expect(() => canPublishCourse({
      instructor: 'Ana Lopez',
      schedule: 'Martes y jueves 18:00-20:00',
      startDate: '2026-10-01',
      endDate: '2026-11-15'
    })).not.toThrow();
  });

  it('impide publicar cuando faltan instructor, horario o fechas', () => {
    expect(() => canPublishCourse({
      instructor: '',
      schedule: '',
      startDate: null,
      endDate: null
    })).toThrow('No se puede publicar un curso sin instructor, horario o fechas definidas.');
  });
});