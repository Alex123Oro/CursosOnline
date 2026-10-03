import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/shared/http-error.js';
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
    })).toThrow(HttpError);

    try {
      canPublishCourse({
        instructor: '',
        schedule: '',
        startDate: null,
        endDate: null
      });
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 400 });
    }
  });

  it('impide publicar cuando la fecha de fin es anterior a la de inicio', () => {
    expect(() => canPublishCourse({
      instructor: 'Ana Lopez',
      schedule: 'Martes y jueves 18:00-20:00',
      startDate: '2026-11-15',
      endDate: '2026-10-01'
    })).toThrow(HttpError);
  });
});

describe('course input dates and status', () => {
  const validCourse = {
    name: 'Curso de seguridad',
    content: 'Contenido de seguridad para personal administrativo',
    durationHours: 12,
    instructor: 'Ana Lopez',
    schedule: 'Martes y jueves 18:00-20:00',
    approvalCriteria: 'Proyecto final',
    startDate: '2026-10-01',
    endDate: '2026-11-15'
  };

  it('rechaza un rango de fechas invertido', () => {
    const result = courseInputSchema.safeParse({
      ...validCourse,
      startDate: '2026-11-15',
      endDate: '2026-10-01'
    });

    expect(result.success).toBe(false);
  });

  it('ignora el estado enviado por el cliente', () => {
    const result = courseInputSchema.parse({
      ...validCourse,
      status: 'PUBLISHED'
    });

    expect(result).not.toHaveProperty('status');
  });
});