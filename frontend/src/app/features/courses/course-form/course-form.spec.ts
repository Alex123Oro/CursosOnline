import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CourseForm } from './course-form';

describe('CourseForm', () => {
  let fixture: ComponentFixture<CourseForm>;
  let component: CourseForm;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CourseForm] }).compileComponents();
    fixture = TestBed.createComponent(CourseForm);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('participantTypes', [{ id: '1', name: 'Estudiante' }]);
    fixture.detectChanges();
    component.setPrice('1', '0');
  });

  // HU4: Reject a course submission without approval criteria.
  it('requires approval criteria before emitting a course', () => {
    const emit = vi.spyOn(component.save, 'emit');
    component.form.patchValue({
      name: 'Curso de seguridad',
      content: 'Contenido de seguridad para personal administrativo',
      approvalCriteria: '   ',
      durationHours: 12,
      instructor: 'Ana Lopez',
      schedule: 'Martes y jueves 18:00-20:00'
    });

    component.submit();

    expect(component.form.controls.approvalCriteria.invalid).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });

  // HU4: Send approval criteria with course creation and update payloads.
  it('includes approval criteria in the submitted course payload', () => {
    const emit = vi.spyOn(component.save, 'emit');
    component.form.patchValue({
      name: 'Curso de seguridad',
      content: 'Contenido de seguridad para personal administrativo',
      approvalCriteria: 'Proyecto final con nota aprobatoria.',
      durationHours: 12,
      instructor: 'Ana Lopez',
      schedule: 'Martes y jueves 18:00-20:00'
    });

    component.submit();

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ approvalCriteria: 'Proyecto final con nota aprobatoria.', prices: [{ participantTypeId: '1', basePrice: 0 }] }));
  });
});
