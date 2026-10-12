import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Enrollment } from '../../../core/enrollment.service';
import { EnrollmentList } from './enrollment-list';

describe('EnrollmentList', () => {
  let fixture: ComponentFixture<EnrollmentList>;
  let component: EnrollmentList;

  const enrollment: Enrollment = {
    id: '1',
    status: 'PREINSCRITO',
    participantId: '2',
    participantName: 'Luis Estudiante',
    participantEmail: 'luis@eva.local',
    courseId: '7',
    courseName: 'PostgreSQL Intermedio',
    courseCode: 'INF-PG-201',
    participantTypeId: '1',
    participantTypeName: 'Estudiante',
    basePrice: 400,
    scholarshipPercent: 0,
    scholarshipReason: null,
    scholarshipActive: false,
    benefitAmount: 0,
    finalAmount: 400,
    paymentRegistered: false,
    paymentAmount: null,
    paymentRegisteredAt: null,
    paymentStatus: 'PENDIENTE',
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    confirmedAt: null
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EnrollmentList] }).compileComponents();
    fixture = TestBed.createComponent(EnrollmentList);
    component = fixture.componentInstance;
  });

  it('shows preenrolled participants and confirmation action', () => {
    fixture.componentRef.setInput('enrollments', [enrollment]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Luis Estudiante');
    expect(fixture.nativeElement.textContent).toContain('Preinscrito');
    expect(fixture.nativeElement.textContent).toContain('Confirmar inscripción');
  });

  it('shows a partial payment amount, state and registration date', () => {
    const partialPayment = {
      ...enrollment,
      paymentRegistered: true,
      paymentAmount: 200,
      paymentRegisteredAt: '2026-10-08T12:00:00.000Z',
      paymentStatus: 'PARCIAL' as const
    };
    fixture.componentRef.setInput('enrollments', [partialPayment]);
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent;
    expect(content).toContain('Parcial');
    expect(content).toContain('200 Bs');
    expect(content).toContain(component.formatPaymentDate(partialPayment.paymentRegisteredAt));
    expect(fixture.nativeElement.querySelector('.publish').disabled).toBe(true);
  });
});
