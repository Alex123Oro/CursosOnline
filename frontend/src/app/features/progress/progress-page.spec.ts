import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { provideRouter } from '@angular/router';
import { ProgressPage } from './progress-page';

describe('ProgressPage', () => {
  let fixture: ComponentFixture<ProgressPage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
    fixture = TestBed.createComponent(ProgressPage);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows enrollment, attendance, evaluation and final outcome', async () => {
    http.expectOne(`${environment.apiBaseUrl}/progress/me`).flush([{
      enrollmentId: '12',
      enrollmentStatus: 'INSCRITO',
      course: { id: '4', code: 'HU22-01', name: 'Curso de progreso', startDate: '2026-08-01', endDate: '2026-08-31' },
      attendance: { presentSessions: 1, completedSessions: 2, percentage: 50, sessions: [
        { sessionId: '1', sessionNumber: 1, date: '2026-08-05', startTime: '10:00', durationMinutes: 60, status: 'PRESENT' },
        { sessionId: '2', sessionNumber: 2, date: '2026-08-12', startTime: '10:00', durationMinutes: 60, status: 'ABSENT' }
      ] },
      evaluations: [{ id: '3', title: 'Trabajo final', score: 82, maxScore: 100, weight: 100, comment: 'Buen trabajo', gradedAt: '2026-08-30T12:00:00.000Z', percentage: 82 }],
      currentGrade: 82,
      finalGrade: 82,
      minimumPassingScore: 70,
      requirements: { academicMet: true, attendanceMet: false, minimumAttendancePercent: 80 },
      finalStatus: 'NO_CUMPLE_ASISTENCIA', certificateEligible: false
    }]);

    await fixture.whenStable();
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent;
    expect(content).toContain('Curso de progreso');
    expect(content).toContain('Inscrito');
    expect(content).toContain('50%');
    expect(content).toContain('82 / 100');
    expect(content).toContain('No cumple la asistencia mínima');
    expect(content).toContain('asistencia mínima 80%');
    expect(content).toContain('Requisito de asistencia: No cumplido');
    expect(Array.from(fixture.nativeElement.querySelectorAll('.summary-card strong'),
      (element: unknown) => (element as HTMLElement).textContent?.trim())).toEqual(['1', '1', '0', '0']);
    expect(fixture.nativeElement.querySelector('.course-links a')?.getAttribute('href')).toBe('/catalogo/4');
  });

  it('shows an empty state when the participant has no enrollments', async () => {
    http.expectOne(`${environment.apiBaseUrl}/progress/me`).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Aún no tienes inscripciones');
    expect(fixture.nativeElement.querySelector('.primary-link')?.getAttribute('href')).toBe('/catalogo');
  });

  it('distinguishes pending enrollment and missing marks from a zero grade or attendance', async () => {
    http.expectOne(`${environment.apiBaseUrl}/progress/me`).flush([{
      enrollmentId: '13', enrollmentStatus: 'PREINSCRITO',
      course: { id: '5', code: 'EVA-05', name: 'Próximo curso', startDate: null, endDate: null },
      attendance: { presentSessions: 0, completedSessions: 0, percentage: null, sessions: [] },
      evaluations: [], currentGrade: null, finalGrade: null, minimumPassingScore: 70,
      requirements: { academicMet: null, attendanceMet: null, minimumAttendancePercent: 80 },
      finalStatus: null, certificateEligible: false
    }]);
    await fixture.whenStable(); fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    expect(Array.from(page.querySelectorAll('.summary-card strong'), element => element.textContent?.trim())).toEqual(['1', '0', '1', '0']);
    expect(page.textContent).toContain('Sin sesiones realizadas');
    expect(page.textContent).toContain('Requisito académico: Pendiente');
    expect(page.textContent).toContain('Requisito de asistencia: Pendiente');
    expect(page.querySelector('progress')).toBeNull();
    expect(page.querySelector('.course-links a[href="/mis-certificados"]')).toBeNull();
  });

  it('shows a retry action instead of empty or stale totals after a load failure', async () => {
    http.expectOne(`${environment.apiBaseUrl}/progress/me`).flush({ message: 'Servicio temporalmente no disponible' }, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable(); fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Servicio temporalmente no disponible');
    expect(page.querySelector('.summary-grid')).toBeNull();
    page.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    http.expectOne(`${environment.apiBaseUrl}/progress/me`).flush([]);
    await fixture.whenStable(); fixture.detectChanges();
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(page.textContent).toContain('Aún no tienes inscripciones');
  });
});
