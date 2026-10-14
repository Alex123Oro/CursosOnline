import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CoursesPage } from './courses-page';
import { Course, CoursePayload } from '../../../core/course.service';
import { environment } from '../../../../environments/environment';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { SessionService } from '../../../core/session.service';

const base = environment.apiBaseUrl;
const payload: CoursePayload = { name: 'Curso de seguridad', content: 'Contenido del curso de seguridad', durationHours: 12,
  instructor: 'Carla', instructorId: '8', schedule: 'Martes 18:00-20:00', approvalCriteria: 'Proyecto final aprobado',
  startDate: '2026-11-01', endDate: '2026-11-30', capacity: 20, preinscriptionStart: '2026-10-01', preinscriptionEnd: '2026-10-31',
  prices: [{ participantTypeId: '1', basePrice: 100 }] };
const saved = { ...payload, id: '42', status: 'DRAFT' } as unknown as Course;
describe('CoursesPage saving workflow', () => {
  let fixture: ComponentFixture<CoursesPage>; let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CoursesPage], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController); fixture = TestBed.createComponent(CoursesPage);
    http.expectOne(`${base}/courses`).flush([]);
    http.expectOne(`${base}/participant-types`).flush([{ id: '1', name: 'Estudiante' }]);
    http.expectOne(`${base}/admin/instructors`).flush([{ id: '8', name: 'Carla' }]);
    fixture.componentInstance.openEditForm(saved); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  it('sends all publication fields and closes the modal only after course and prices are saved', () => {
    const page = fixture.componentInstance;
    page.handleSave(payload); page.handleSave(payload);
    const create = http.expectOne(`${base}/courses/42`);
    expect(create.request.body).toMatchObject({ capacity: 20, preinscriptionStart: '2026-10-01', preinscriptionEnd: '2026-10-31', instructorId: '8' });
    create.flush(saved); page.closeForm(); expect(page.isFormOpen()).toBe(true);
    http.expectOne(`${base}/courses/42/prices`).flush(saved);
    http.expectOne(`${base}/courses`).flush([saved]); fixture.detectChanges();
    expect(page.isFormOpen()).toBe(false); expect(page.isSaving()).toBe(false);
    expect(fixture.nativeElement.querySelector('app-course-form')).toBeNull();
    expect(page.feedback()).toBe('Curso actualizado correctamente.');
  });
  it('keeps the editing modal open on failure and retries the save', () => {
    const page = fixture.componentInstance; page.handleSave(payload);
    http.expectOne(`${base}/courses/42`).flush(saved);
    http.expectOne(`${base}/courses/42/prices`).flush({ message: 'No se pudieron guardar los precios' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges(); expect(page.isFormOpen()).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('No se pudieron guardar los precios');
    page.handleSave(payload);
    const update = http.expectOne(`${base}/courses/42`); expect(update.request.method).toBe('PUT'); update.flush(saved);
    http.expectOne(`${base}/courses/42/prices`).flush(saved);
    http.expectOne(`${base}/courses`).flush([saved]); expect(page.isFormOpen()).toBe(false);
  });
});

describe('New course navigation', () => {
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ providers: [
      provideRouter(routes.filter(route => !route.redirectTo).map(route => ({ ...route, canActivate: [] }))),
      { provide: SessionService, useValue: { currentUser: () => ({ role: 'ADMIN' }) } },
      provideHttpClient(), provideHttpClientTesting()
    ] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function loadOptions() {
    http.expectOne(`${base}/participant-types`).flush([{ id: '1', name: 'Estudiante' }]);
    http.expectOne(`${base}/admin/instructors`).flush([{ id: '8', name: 'Carla' }]);
  }

  it('opens a dedicated screen from Nuevo curso and returns on cancellation', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/cursos');
    http.expectOne(`${base}/courses`).flush([]);
    loadOptions(); harness.detectChanges();
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('.page-header .primary-btn')?.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/cursos/nuevo');
    loadOptions(); harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Nuevo curso');
    expect(harness.routeNativeElement?.querySelector('.modal-backdrop')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('app-course-list')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('.form-actions .secondary-btn')?.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/cursos');
    http.expectOne(`${base}/courses`).flush([]);
    loadOptions();
  });

  it('waits for prices, retains failed input, and retries without duplicate creation', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/cursos/nuevo', CoursesPage);
    loadOptions(); harness.detectChanges();
    page.handleSave(payload); page.handleSave(payload);
    http.expectOne(`${base}/courses`).flush(saved);
    page.closeForm();
    expect(TestBed.inject(Router).url).toBe('/cursos/nuevo');
    http.expectOne(`${base}/courses/42/prices`).flush({ message: 'Error al guardar precios' }, { status: 500, statusText: 'Error' });
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain('Error al guardar precios');
    page.handleSave(payload);
    http.expectOne(`${base}/courses/42`).flush(saved);
    http.expectOne(`${base}/courses/42/prices`).flush(saved);
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/cursos/42/sesiones?plan=weekly');
    http.expectOne(`${base}/courses/42/sessions`).flush({ course: { ...saved, instructorId: '8' }, sessions: [] });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Curso guardado como borrador');
    expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
  });
});
