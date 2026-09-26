import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Course } from '../../../core/course.service';
import { ParticipantCatalogPage } from './participant-catalog-page';

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

  afterEach(() => httpTesting.verify());

  it('loads published courses from the catalogue API', async () => {
    const request = httpTesting.expectOne('http://localhost:3000/api/courses/catalog');
    expect(request.request.method).toBe('GET');
    request.flush([catalogCourse]);

    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Programación con JavaScript');
    expect(fixture.nativeElement.querySelectorAll('.course-card')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('app-participant-header')).not.toBeNull();
    const action = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.course-action');
    expect(action?.getAttribute('href')).toBe('/catalogo/42');
  });

  it('filters courses from the API by a case-insensitive query across name, code and instructor', async () => {
    const request = httpTesting.expectOne('http://localhost:3000/api/courses/catalog');
    request.flush([catalogCourse]);
    await fixture.whenStable();

    component.onSearch('valeria');

    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll('.course-card')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Programación con JavaScript');
  });

  it('shows an actionable empty state and clears the search query', async () => {
    const request = httpTesting.expectOne('http://localhost:3000/api/courses/catalog');
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
    const request = httpTesting.expectOne('http://localhost:3000/api/courses/catalog');
    request.error(new ProgressEvent('error'));

    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.catalog-error')).not.toBeNull();
  });

  it('uses a labelled content section rather than nesting a second main landmark', async () => {
    const request = httpTesting.expectOne('http://localhost:3000/api/courses/catalog');
    request.flush([]);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('main')).toBeNull();
    expect(fixture.nativeElement.querySelector('section#catalog-content')).not.toBeNull();
  });
});
