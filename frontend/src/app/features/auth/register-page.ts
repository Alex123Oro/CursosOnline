import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { SessionService } from '../../core/session.service';
import { returnToCourse } from '../../core/return-to-course';

const studentEmail = (email: string) => ['est.umss.edu', 'ms.umss.edu'].includes(email.trim().toLowerCase().split('@')[1] ?? '');

@Component({
  selector: 'app-register-page', standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.html', styleUrls: ['./login-page.scss', './register-page.scss']
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly session = inject(SessionService);
  readonly submitting = signal(false);
  readonly sentEmail = signal('');
  readonly feedback = signal('');
  readonly resent = signal(false);
  readonly returnTo = returnToCourse(inject(ActivatedRoute).snapshot.queryParamMap.get('returnTo'));
  readonly form = this.fb.nonNullable.group({
    participantKind: ['UMSS' as 'UMSS' | 'EXTERNAL', Validators.required],
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150), Validators.pattern(/\S.{1,}\S/)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    confirmPassword: ['', Validators.required]
  }, { validators: control => {
    const { email, participantKind, password, confirmPassword } = control.value;
    const errors = {
      ...(email && ((participantKind === 'UMSS') !== studentEmail(email)) ? { emailCategory: true } : {}),
      ...(password !== confirmPassword ? { passwordMismatch: true } : {})
    };
    return Object.keys(errors).length ? errors : null;
  } });
  readonly resendForm = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]] });

  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) return;
    const { confirmPassword: _, ...input } = this.form.getRawValue();
    input.name = input.name.trim();
    input.email = input.email.trim().toLowerCase();
    this.feedback.set('');
    this.submitting.set(true);
    this.session.register({ ...input, ...(this.returnTo ? { returnTo: this.returnTo } : {}) }).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: () => {
        this.sentEmail.set(input.email);
        this.resendForm.controls.email.setValue(input.email);
        this.form.controls.password.reset();
        this.form.controls.confirmPassword.reset();
      },
      error: error => this.feedback.set(this.errorMessage(error))
    });
  }

  resend() {
    this.resendForm.markAllAsTouched();
    if (this.resendForm.invalid || this.submitting()) return;
    this.feedback.set('');
    this.resent.set(false);
    this.submitting.set(true);
    this.session.resendConfirmation(this.resendForm.getRawValue().email.trim().toLowerCase(), ...(this.returnTo ? [this.returnTo] : []))
      .pipe(finalize(() => this.submitting.set(false))).subscribe({
        next: () => this.resent.set(true),
        error: error => this.feedback.set(this.errorMessage(error))
      });
  }

  private errorMessage(error: unknown) {
    if (error instanceof HttpErrorResponse) return error.error?.fields?.[0]?.message ?? error.error?.message ?? 'No se pudo completar la solicitud.';
    return 'No se pudo completar la solicitud.';
  }
}
