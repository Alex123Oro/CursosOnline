import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EnrollmentList } from './enrollment-list';
import { Enrollment } from '../../../core/enrollment.service';
describe('EnrollmentList', () => {
  let fixture: ComponentFixture<EnrollmentList>;
  const row = {
    id: '1',
    participantName: 'Luis',
    participantEmail: 'luis@test',
    participantTypeName: 'Estudiante',
    finalAmount: 400,
    paymentStatus: 'PARCIAL',
    paymentAmount: 200,
    confirmedAt: '2026-10-14T12:00:00Z',
  } as Enrollment;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EnrollmentList],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(EnrollmentList);
  });
  it('shows participant management instead of mixing course and status actions', () => {
    fixture.componentRef.setInput('enrollments', [row]);
    fixture.componentRef.setInput('context', { curso: '7', estado: 'preinscritos' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Luis');
    expect(fixture.nativeElement.textContent).toContain('Parcial');
    expect(fixture.nativeElement.textContent).toContain('200 Bs registrados');
    expect(fixture.nativeElement.querySelector('a.manage').getAttribute('href')).toContain(
      '/inscripciones/1?curso=7'
    );
    expect(fixture.nativeElement.textContent).not.toContain('Confirmar inscripción');
  });
  it('adds the confirmation column only to the confirmed group', () => {
    fixture.componentRef.setInput('enrollments', [row]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('th.confirmed-column')).toBeNull();
    fixture.componentRef.setInput('status', 'INSCRITO');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('th.confirmed-column')).not.toBeNull();
  });
});
