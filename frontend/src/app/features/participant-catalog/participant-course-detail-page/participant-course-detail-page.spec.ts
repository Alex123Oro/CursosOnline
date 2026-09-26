import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Course } from '../../../core/course.service';
import { ParticipantCourseDetailPage } from './participant-course-detail-page';

describe('ParticipantCourseDetailPage', () => {
  let fixture: ComponentFixture<ParticipantCourseDetailPage>;
  let httpTesting: HttpTestingController;
  let paramMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const course: Course = {
    id: '42',
    code: 'INF-JS-101',
    name: 'Programación con JavaScript',
    content: 'Aprende los fundamentos de JavaScript para crear aplicaciones web.',
    durationHours: 32,
    instructor: 'Valeria Ríos',
    schedule: 'Martes y jueves · 19:00 – 21:00',
    approvalCriteria: 'Nota mínima de 70/100 y asistencia mínima de 80%.',
    status: 'PUBLISHED',
    startDate: '2026-10-06',
    endDate: '2026-11-12',
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z'
  };

  beforeEach(async () => {
    paramMap = new BehaviorSubject(convertToParamMap({ id: '42' }));

    await TestBed.configureTestingModule({
      imports: [ParticipantCourseDetailPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ParticipantCourseDetailPage);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('shows all available public course information', async () => {
    const request = httpTesting.expectOne('http://localhost:3000/api/courses/catalog/42');
    request.flush(course);

    await fixture.whenStable();

    const content = fixture.nativeElement.textContent;
    expect(content).toContain('Programación con JavaScript');
    expect(content).toContain('Aprende los fundamentos de JavaScript');
    expect(content).toContain('32 horas');
    expect(content).toContain('Valeria Ríos');
    expect(content).toContain('Martes y jueves');
    expect(content).toContain('Nota mínima de 70/100');
    const backLink = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.back-link');
    expect(backLink?.getAttribute('href')).toBe('/catalogo');
  });

  it('shows a not-available message when the course cannot be loaded', async () => {
    const request = httpTesting.expectOne('http://localhost:3000/api/courses/catalog/42');
    request.flush({ message: 'El curso no esta disponible.' }, { status: 404, statusText: 'Not Found' });

    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.course-detail-error')).not.toBeNull();
  });

  it('loads the next course after a not-available result on the same route', async () => {
    const unavailableRequest = httpTesting.expectOne('http://localhost:3000/api/courses/catalog/42');
    unavailableRequest.flush({ message: 'El curso no esta disponible.' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    paramMap.next(convertToParamMap({ id: '7' }));
    const nextRequest = httpTesting.expectOne('http://localhost:3000/api/courses/catalog/7');
    nextRequest.flush({ ...course, id: '7', name: 'Administración Básica de Linux' });
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.course-detail-error')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Administración Básica de Linux');
  });
});
