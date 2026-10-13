import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CoursesPage } from './courses-page';
import { Course, CoursePayload } from '../../../core/course.service';
import { environment } from '../../../../environments/environment';

const base = environment.apiBaseUrl;
const payload: CoursePayload = { name: 'Curso de seguridad', content: 'Contenido del curso de seguridad', durationHours: 12,
  instructor: 'Carla', instructorId: '8', schedule: 'Martes 18:00-20:00', approvalCriteria: 'Proyecto final aprobado',
  startDate: '2026-11-01', endDate: '2026-11-30', capacity: 20, preinscriptionStart: '2026-10-01', preinscriptionEnd: '2026-10-31',
  prices: [{ participantTypeId: '1', basePrice: 100 }] };
const saved = { ...payload, id: '42', status: 'DRAFT' } as unknown as Course;
describe('CoursesPage saving workflow', () => {
  let fixture: ComponentFixture<CoursesPage>; let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CoursesPage], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController); fixture = TestBed.createComponent(CoursesPage);
    http.expectOne(`${base}/courses`).flush([]);
    http.expectOne(`${base}/participant-types`).flush([{ id: '1', name: 'Estudiante' }]);
    http.expectOne(`${base}/admin/instructors`).flush([{ id: '8', name: 'Carla' }]);
    fixture.componentInstance.openCreateForm(); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  it('sends all publication fields and closes the modal only after course and prices are saved', () => {
    const page = fixture.componentInstance;
    page.handleSave(payload); page.handleSave(payload);
    const create = http.expectOne(`${base}/courses`);
    expect(create.request.body).toMatchObject({ capacity: 20, preinscriptionStart: '2026-10-01', preinscriptionEnd: '2026-10-31', instructorId: '8' });
    create.flush(saved); page.closeForm(); expect(page.isFormOpen()).toBe(true);
    http.expectOne(`${base}/courses/42/prices`).flush(saved);
    http.expectOne(`${base}/courses`).flush([saved]); fixture.detectChanges();
    expect(page.isFormOpen()).toBe(false); expect(page.isSaving()).toBe(false);
    expect(fixture.nativeElement.querySelector('app-course-form')).toBeNull();
    expect(page.feedback()).toBe('Curso registrado correctamente.');
  });
  it('keeps the modal on failure and retries prices without creating a duplicate course', () => {
    const page = fixture.componentInstance; page.handleSave(payload);
    http.expectOne(`${base}/courses`).flush(saved);
    http.expectOne(`${base}/courses/42/prices`).flush({ message: 'No se pudieron guardar los precios' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges(); expect(page.isFormOpen()).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('No se pudieron guardar los precios');
    page.handleSave(payload);
    const update = http.expectOne(`${base}/courses/42`); expect(update.request.method).toBe('PUT'); update.flush(saved);
    http.expectOne(`${base}/courses/42/prices`).flush(saved);
    http.expectOne(`${base}/courses`).flush([saved]); expect(page.isFormOpen()).toBe(false);
  });
});
