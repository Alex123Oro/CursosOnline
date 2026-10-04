import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { calculateEnrollmentAmount } from '../../../core/enrollment-amount';
import { Enrollment, EnrollmentService } from '../../../core/enrollment.service';
import { EnrollmentList } from '../enrollment-list/enrollment-list';
import { SessionService } from '../../../core/session.service';

type ModalMode = 'scholarship' | 'payment' | 'confirm' | null;

@Component({
  selector: 'app-enrollments-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, EnrollmentList],
  templateUrl: './enrollments-page.html',
  styleUrl: './enrollments-page.scss'
})
export class EnrollmentsPage {
  private readonly enrollmentService = inject(EnrollmentService);
  private readonly fb = inject(FormBuilder);
  private readonly session = inject(SessionService);

  readonly enrollments = signal<Enrollment[]>([]);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly feedback = signal('');
  readonly modal = signal<ModalMode>(null);
  readonly selected = signal<Enrollment | null>(null);

  readonly scholarshipForm = this.fb.nonNullable.group({
    scholarshipPercent: [0, [Validators.required, Validators.min(0), Validators.max(100)]]
  });

  readonly paymentForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0)]]
  });

  constructor() {
    effect(onCleanup => {
      const user = this.session.currentUser();
      this.enrollments.set([]);
      this.feedback.set('');
      this.isLoading.set(false);
      this.closeModal();
      if (!user) return;
      const subscription = untracked(() => this.loadEnrollments());
      onCleanup(() => subscription.unsubscribe());
    });
  }

  previewAmounts() {
    const enrollment = this.selected();
    if (!enrollment) return null;
    return calculateEnrollmentAmount(enrollment.basePrice, Number(this.scholarshipForm.controls.scholarshipPercent.value));
  }

  openScholarship(enrollment: Enrollment) {
    this.selected.set(enrollment);
    this.scholarshipForm.reset({ scholarshipPercent: enrollment.scholarshipPercent });
    this.modal.set('scholarship');
  }

  openPayment(enrollment: Enrollment) {
    this.selected.set(enrollment);
    this.paymentForm.reset({ amount: enrollment.finalAmount });
    this.modal.set('payment');
  }

  openConfirm(enrollment: Enrollment) {
    this.selected.set(enrollment);
    this.modal.set('confirm');
  }

  closeModal() {
    this.modal.set(null);
    this.selected.set(null);
  }

  saveScholarship() {
    this.scholarshipForm.markAllAsTouched();
    const enrollment = this.selected();
    if (this.scholarshipForm.invalid || !enrollment) return;

    this.isSaving.set(true);
    this.enrollmentService.assignScholarship(enrollment.id, Number(this.scholarshipForm.controls.scholarshipPercent.value))
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: () => {
          this.feedback.set('Beca asignada correctamente.');
          this.closeModal();
          this.loadEnrollments();
        },
        error: error => this.feedback.set(this.errorMessage(error))
      });
  }

  savePayment() {
    this.paymentForm.markAllAsTouched();
    const enrollment = this.selected();
    if (this.paymentForm.invalid || !enrollment) return;

    this.isSaving.set(true);
    this.enrollmentService.registerPayment(enrollment.id, Number(this.paymentForm.controls.amount.value))
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: () => {
          this.feedback.set('Pago registrado correctamente.');
          this.closeModal();
          this.loadEnrollments();
        },
        error: error => this.feedback.set(this.errorMessage(error))
      });
  }

  confirmSelected() {
    const enrollment = this.selected();
    if (!enrollment) return;

    this.isSaving.set(true);
    this.enrollmentService.confirm(enrollment.id)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: () => {
          this.feedback.set('Inscripción confirmada correctamente.');
          this.closeModal();
          this.loadEnrollments();
        },
        error: error => this.feedback.set(this.errorMessage(error))
      });
  }

  private loadEnrollments() {
    this.isLoading.set(true);
    return this.enrollmentService.list()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: enrollments => this.enrollments.set(enrollments),
        error: error => this.feedback.set(this.errorMessage(error))
      });
  }

  private errorMessage(error: unknown) {
    if (error instanceof HttpErrorResponse) {
      const fields = error.error?.fields as { message: string }[] | undefined;
      if (fields?.length) return fields.map(field => field.message).join(' ');
      return error.error?.message ?? 'No se pudo completar la operación.';
    }

    return 'No se pudo completar la operación.';
  }
}
