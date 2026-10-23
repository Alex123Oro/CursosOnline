import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { profileHome } from '../../core/role.guard';
import { SessionService } from '../../core/session.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrls: ['./login-page.scss', './login-layout.scss']
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  readonly submitting = signal(false);
  readonly feedback = signal('');
  readonly showPassword = signal(false);
  readonly year = new Date().getFullYear();
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) return;
    this.feedback.set('');
    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();
    this.session.login(email, password).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: user => void this.router.navigateByUrl(profileHome(user.role)),
      error: error => this.feedback.set(this.errorMessage(error))
    });
  }

  private errorMessage(error: unknown) {
    if (error instanceof HttpErrorResponse) return error.error?.message ?? 'No se pudo iniciar sesión.';
    return 'No se pudo iniciar sesión.';
  }
}
