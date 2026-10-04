import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/shared/http-error.js';
import { canPublishCourse, courseInputSchema, coursePricesSchema, scholarshipSchema } from '../src/modules/courses/course.rules.js';

describe('course rules (HU-01)', () => {
  it('acepta un curso valido y rechaza duracion invalida', () => {
    expect(() => courseInputSchema.parse({
      name: 'Curso de seguridad',
      content: 'Contenido de seguridad para personal administrativo',
      durationHours: 12,
      instructor: 'Ana Lopez',
      schedule: 'Martes y jueves 18:00-20:00'
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
      endDate: '2026-10-01',
      capacity: 20,
      preinscriptionStart: '2026-09-01',
      preinscriptionEnd: '2026-09-30'
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

describe('precios y becas', () => {
  it('acepta un precio valido', () => {
    expect(coursePricesSchema.parse({
      items: [{ participantTypeId: 1, basePrice: 500 }]
    }).items[0]?.basePrice).toBe(500);
  });

  it('rechaza un precio negativo', () => {
    const result = coursePricesSchema.safeParse({
      items: [{ participantTypeId: 1, basePrice: -1 }]
    });

    expect(result.success).toBe(false);
  });

  it('acepta becas de 0, parcial y 100', () => {
    expect(scholarshipSchema.parse({ scholarshipPercent: 0 }).scholarshipPercent).toBe(0);
    expect(scholarshipSchema.parse({ scholarshipPercent: 30 }).scholarshipPercent).toBe(30);
    expect(scholarshipSchema.parse({ scholarshipPercent: 100 }).scholarshipPercent).toBe(100);
  });

  it('rechaza becas de -1 y 101', () => {
    expect(scholarshipSchema.safeParse({ scholarshipPercent: -1 }).success).toBe(false);
    expect(scholarshipSchema.safeParse({ scholarshipPercent: 101 }).success).toBe(false);
  });
});
