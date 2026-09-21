import { describe, expect, it } from 'vitest';
import { courseInputSchema } from '../src/modules/courses/course.rules.js';

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