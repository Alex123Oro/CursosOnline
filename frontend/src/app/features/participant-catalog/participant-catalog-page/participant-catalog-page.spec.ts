import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Course } from '../../../core/course.service';
import { ParticipantCatalogPage } from './participant-catalog-page';
import { environment } from '../../../../environments/environment';

describe('ParticipantCatalogPage', () => {
  let fixture: ComponentFixture<ParticipantCatalogPage>;
  let component: ParticipantCatalogPage;
  let httpTesting: HttpTestingController;

  const catalogCourse: Course = {
    id: '42',
    code: 'INF-JS-101',
    name: 'Programación con JavaScript',
    content: 'Aprende los fundamentos de JavaScript para crear aplicaciones web.',
    durationHours: 32,
    instructor: 'Valeria Ríos',
    schedule: 'Martes y jueves · 19:00 – 21:00',
    approvalCriteria: 'Nota mínima de 70/100 y asistencia de 80%.',
    status: 'PUBLISHED',
    startDate: '2026-10-06',
    endDate: '2026-11-12',
    capacity: 24,
    preinscriptionStart: '2026-09-01',
    preinscriptionEnd: '2026-12-31',
    occupiedSlots: 0,
    remainingSlots: 24,
    prices: [],
    enrollment: null,
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantCatalogPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(ParticipantCatalogPage);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.match(req => req.url.includes('/session/users')).forEach(req => req.flush([]));
    httpTesting.verify();
  });

  it('loads published courses from the catalogue API', async () => {
    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/courses/catalog`);
    expect(request.request.method).toBe('GET');
    request.flush([catalogCourse]);

    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Programación con JavaScript');
    expect(fixture.nativeElement.querySelectorAll('.course-card')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('app-participant-header')).not.toBeNull();
    const action = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.course-action');
    expect(action?.getAttribute('href')).toBe('/catalogo/42');
    expect(fixture.nativeElement.querySelector('.course-card')?.textContent).not.toContain(catalogCourse.schedule);
  });

  it('filters courses from the API by a case-insensitive query across name, code and instructor', async () => {
    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/courses/catalog`);
    request.flush([catalogCourse]);
    await fixture.whenStable();

    component.onSearch('valeria');

    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll('.course-card')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Programación con JavaScript');
  });

  it('shows an actionable empty state and clears the search query', async () => {
    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/courses/catalog`);
    request.flush([catalogCourse]);
    await fixture.whenStable();

    component.onSearch('sin coincidencias');

    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.empty-state')).not.toBeNull();

    const clearButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.clear-filters');
    clearButton?.click();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll('.course-card')).toHaveLength(1);
  });

  it('shows an error message when the catalogue API is unavailable', async () => {
    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/courses/catalog`);
    request.error(new ProgressEvent('error'));

    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.catalog-error')).not.toBeNull();
  });

  it('uses a labelled content section rather than nesting a second main landmark', async () => {
    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/courses/catalog`);
    request.flush([]);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('main')).toBeNull();
    expect(fixture.nativeElement.querySelector('section#catalog-content')).not.toBeNull();
  });

  it('combines availability, price, duration and instructor filters, excluding full or closed courses', async () => {
    const open = { ...catalogCourse, preinscriptionStart: '2000-01-01', preinscriptionEnd: '2099-12-31', durationHours: 12, prices: [{ participantTypeId: '1', participantTypeName: 'Estudiante', basePrice: 0 }] };
    httpTesting.expectOne(`${environment.apiBaseUrl}/courses/catalog`).flush([
      open,
      { ...open, id: '43', remainingSlots: 0 },
      { ...open, id: '44', preinscriptionEnd: '2000-01-02' },
      { ...open, id: '45', durationHours: 40 },
      { ...open, id: '46', instructor: 'Otro instructor' },
      { ...open, id: '47', prices: [{ participantTypeId: '1', participantTypeName: 'Estudiante', basePrice: 200 }] }
    ]);
    component.setFilter('available', true);
    component.setFilter('free', true);
    component.setDuration('short');
    component.setInstructor(catalogCourse.instructor);
    await fixture.whenStable();
    expect(component.filteredCourses().map(course => course.id)).toEqual(['42']);
    expect(component.activeFilterCount()).toBe(4);
    expect(fixture.nativeElement.querySelectorAll('.course-card')).toHaveLength(1);
    component.clearFilters();
    expect(component.filteredCourses()).toHaveLength(6);
    expect(component.activeFilterCount()).toBe(0);
  });

  it('paginates results and returns to the first page when a filter changes', async () => {
    const courses = Array.from({ length: 25 }, (_, index) => ({ ...catalogCourse, id: String(index), code: `CUR-${index}` }));
    httpTesting.expectOne(`${environment.apiBaseUrl}/courses/catalog`).flush(courses);
    component.changePage(3);
    await fixture.whenStable();
    expect(component.visibleCourses()).toHaveLength(1);
    expect(component.firstResult()).toBe(25);
    expect(fixture.nativeElement.querySelector('[aria-current="page"]')?.textContent.trim()).toBe('3');
    component.onSearch('CUR-24');
    await fixture.whenStable();
    expect(component.currentPage()).toBe(1);
    expect(component.visibleCourses().map(course => course.id)).toEqual(['24']);
    expect(fixture.nativeElement.querySelector('.pagination')).toBeNull();
  });

  it('sorts real prices with unknown prices last and normalizes accents in search', async () => {
    const priced = (id: string, amount: number) => ({ ...catalogCourse, id, prices: [{ participantTypeId: '1', participantTypeName: 'Estudiante', basePrice: amount }] });
    httpTesting.expectOne(`${environment.apiBaseUrl}/courses/catalog`).flush([
      { ...catalogCourse, id: 'unknown' }, priced('paid', 200), { ...priced('free', 0), name: 'Análisis de datos' }
    ]);
    component.setSort('price');
    expect(component.filteredCourses().map(course => course.id)).toEqual(['free', 'paid', 'unknown']);
    component.onSearch('analisis');
    expect(component.filteredCourses().map(course => course.id)).toEqual(['free']);
    await fixture.whenStable();
  });
});
