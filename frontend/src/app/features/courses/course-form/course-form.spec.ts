import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CourseForm } from './course-form';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';

describe('CourseForm', () => {
  let fixture: ComponentFixture<CourseForm>;
  let component: CourseForm;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CourseForm], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    fixture = TestBed.createComponent(CourseForm);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('participantTypes', [{ id: '1', name: 'Estudiante' }]);
    fixture.componentRef.setInput('instructors', [{ id: '8', name: 'Ana Lopez' }, { id: '9', name: 'Carla Rios' }]);
    fixture.detectChanges();
    component.setPrice('1', '0');
    component.form.patchValue({ capacity: 20, startDate: '2026-11-01', endDate: '2026-11-30', preinscriptionStart: '2026-10-01', preinscriptionEnd: '2026-10-31' });
  });

  // HU4: Reject a course submission without approval criteria.
  it('uploads a cover and includes its persisted URL in the course payload', () => {
    validForm();
    const emit = vi.spyOn(component.save, 'emit');
    const file = new File(['image'], 'cover.png', { type: 'image/png' });
    component.uploadCover({ files: [file], value: 'cover.png' } as unknown as HTMLInputElement);
    expect(component.uploadingCover()).toBe(true);
    component.submit(); expect(emit).not.toHaveBeenCalled();
    const request = TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/courses/covers`);
    expect(request.request.body).toBe(file);
    expect(request.request.headers.get('Content-Type')).toBe('image/png');
    request.flush({ coverUrl: 'https://example.com/cover.png' });
    component.submit();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ coverUrl: 'https://example.com/cover.png' }));
    TestBed.inject(HttpTestingController).verify();
  });

  it('rejects executable cover URLs and permits removing a selected cover', () => {
    validForm();
    component.selectCover('javascript:alert(1)');
    expect(component.form.controls.coverUrl.invalid).toBe(true);
    component.selectCover('/images/course-covers/python.svg');
    expect(component.form.controls.coverUrl.valid).toBe(true);
    component.selectCover('');
    const emit = vi.spyOn(component.save, 'emit');
    component.submit();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ coverUrl: null }));
  });

  it('requires approval criteria before emitting a course', () => {
    const emit = vi.spyOn(component.save, 'emit');
    component.form.patchValue({
      name: 'Curso de seguridad',
      content: 'Contenido de seguridad para personal administrativo',
      approvalCriteria: '   ',
      durationHours: 12,
      instructorId: '8',
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
      instructorId: '8',
      schedule: 'Martes y jueves 18:00-20:00'
    });

    component.submit();

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ approvalCriteria: 'Proyecto final con nota aprobatoria.', prices: [{ participantTypeId: '1', basePrice: 0 }] }));
  });
  function validForm() {
    component.form.patchValue({ name: 'Curso de seguridad', content: 'Contenido del curso de seguridad',
      approvalCriteria: 'Proyecto final aprobado', durationHours: 12, instructorId: '9', schedule: 'Martes 18:00-20:00' });
  }
  it('omits docente and administrativo prices from the form and requirements', () => {
    fixture.componentRef.setInput('participantTypes', [
      { id: '1', name: 'Estudiante' }, { id: '2', name: 'Docente' },
      { id: '3', name: 'Administrativo' }, { id: '4', name: 'Externo' }
    ]);
    fixture.detectChanges(); validForm(); component.setPrice('4', '200');
    const emit = vi.spyOn(component.save, 'emit'); component.submit();
    const labels = [...fixture.nativeElement.querySelectorAll('.prices-block label')].map((label: any) => label.textContent);
    expect(labels).toEqual(['Estudiante (Bs) *', 'Externo (Bs) *']);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      instructor: 'Carla Rios', instructorId: '9',
      prices: [{ participantTypeId: '1', basePrice: 0 }, { participantTypeId: '4', basePrice: 200 }]
    }));
  });
  it('saves without a text schedule and requires an external price', () => {
    fixture.componentRef.setInput('participantTypes', [{ id: '1', name: 'Estudiante' }, { id: '4', name: 'Externo' }]);
    fixture.detectChanges(); validForm(); component.form.controls.schedule.setValue('');
    const emit = vi.spyOn(component.save, 'emit');
    component.submit(); expect(emit).not.toHaveBeenCalled();
    component.setPrice('4', '150'); component.submit();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ prices: [{ participantTypeId: '1', basePrice: 0 }, { participantTypeId: '4', basePrice: 150 }] }));
    expect(emit.mock.calls[0][0]).not.toHaveProperty('schedule');
    expect(fixture.nativeElement.querySelector('input[formControlName="schedule"]')).toBeNull();
  });
  it('offers registered instructors and rejects unregistered selections', () => {
    validForm(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[formControlName="instructor"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('select[formControlName="instructorId"] option')).toHaveLength(3);
    const emit = vi.spyOn(component.save, 'emit');
    component.form.controls.instructorId.setValue('999'); component.submit();
    expect(emit).not.toHaveBeenCalled(); expect(component.form.controls.instructorId.invalid).toBe(true);
  });
  it('restores the assigned instructor when editing, including legacy courses with only a name', () => {
    fixture.componentRef.setInput('course', { instructor: 'Ana Lopez', instructorId: '9', prices: [] });
    fixture.detectChanges(); expect(component.form.controls.instructorId.value).toBe('9');
    fixture.componentRef.setInput('course', { instructor: 'Ana Lopez', instructorId: null, prices: [] });
    fixture.detectChanges(); expect(component.form.controls.instructorId.value).toBe('8');
  });
  it('blocks submission while instructors are loading or failed to load', () => {
    validForm(); const emit = vi.spyOn(component.save, 'emit');
    fixture.componentRef.setInput('instructorsLoading', true); fixture.detectChanges(); component.submit();
    expect(emit).not.toHaveBeenCalled();
    fixture.componentRef.setInput('instructorsLoading', false);
    fixture.componentRef.setInput('instructorsError', 'No se pudo cargar'); fixture.detectChanges(); component.submit();
    expect(emit).not.toHaveBeenCalled();
  });
  it('includes all publication requirements in the course payload', () => {
    validForm(); const emit = vi.spyOn(component.save, 'emit'); component.submit();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ instructorId: '9', instructor: 'Carla Rios',
      capacity: 20, startDate: '2026-11-01', endDate: '2026-11-30',
      preinscriptionStart: '2026-10-01', preinscriptionEnd: '2026-10-31' }));
  });
  it('requires capacity and registration dates and rejects reversed date ranges', () => {
    validForm(); const emit = vi.spyOn(component.save, 'emit');
    component.form.patchValue({ capacity: null, preinscriptionStart: '' }); component.submit();
    expect(emit).not.toHaveBeenCalled(); expect(component.form.controls.capacity.invalid).toBe(true);
    component.form.patchValue({ capacity: 1.5, preinscriptionStart: '2026-10-01' }); component.submit();
    expect(component.form.controls.capacity.invalid).toBe(true); expect(emit).not.toHaveBeenCalled();
    component.form.patchValue({ capacity: 20, endDate: '2026-10-01', preinscriptionEnd: '2026-09-01' }); component.submit();
    expect(component.form.hasError('courseDateOrder')).toBe(true);
    expect(component.form.hasError('preinscriptionDateOrder')).toBe(true); expect(emit).not.toHaveBeenCalled();
  });
  it('preserves publication fields when editing an existing course', () => {
    fixture.componentRef.setInput('course', { instructor: 'Ana Lopez', instructorId: '8', prices: [], capacity: 25,
      startDate: '2026-12-01', endDate: '2026-12-31', preinscriptionStart: '2026-11-01', preinscriptionEnd: '2026-11-30' });
    fixture.detectChanges();
    expect(component.form.getRawValue()).toMatchObject({ capacity: 25, preinscriptionStart: '2026-11-01', preinscriptionEnd: '2026-11-30' });
  });
  it('sends the minimum enrollment and rejects zero, fractions and values exceeding capacity', () => {
    validForm(); const emit = vi.spyOn(component.save, 'emit');
    for (const value of [0, -1, 1.5, 21]) {
      component.form.controls.minimumEnrollment.setValue(value); component.submit();
      expect(emit).not.toHaveBeenCalled();
    }
    component.form.controls.minimumEnrollment.setValue(5); component.submit();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ minimumEnrollment: 5, capacity: 20 }));
  });
  it('restores the minimum enrollment when editing a course', () => {
    fixture.componentRef.setInput('course', { instructor: 'Ana Lopez', instructorId: '8', prices: [], capacity: 25, minimumEnrollment: 10 });
    fixture.detectChanges(); expect(component.form.controls.minimumEnrollment.value).toBe(10);
  });
});
