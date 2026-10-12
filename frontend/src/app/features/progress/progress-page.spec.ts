import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { ProgressPage } from './progress-page';

describe('ProgressPage', () => {
  let fixture: ComponentFixture<ProgressPage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressPage],
      providers: [provideHttpClient(), provideHttpClientTesting()]
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
      attendance: { presentSessions: 1, completedSessions: 2, percentage: 50 },
      evaluations: [{ id: '3', title: 'Trabajo final', score: 82, maxScore: 100, weight: 100, comment: 'Buen trabajo', gradedAt: '2026-08-30T12:00:00.000Z', percentage: 82 }],
      currentGrade: 82,
      finalGrade: 82,
      minimumPassingScore: 70,
      requirements: { academicMet: true, attendanceMet: false, minimumAttendancePercent: 80 },
      finalStatus: 'APROBADO'
    }]);

    await fixture.whenStable();
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent;
    expect(content).toContain('Curso de progreso');
    expect(content).toContain('Inscrito');
    expect(content).toContain('50%');
    expect(content).toContain('82 / 100');
    expect(content).toContain('APROBADO');
    expect(content).toContain('asistencia mínima 80%');
    expect(content).toContain('Requisito de asistencia: No cumplido');
  });

  it('shows an empty state when the participant has no enrollments', async () => {
    http.expectOne(`${environment.apiBaseUrl}/progress/me`).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Aún no tienes inscripciones');
  });
});
