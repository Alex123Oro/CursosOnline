import { Component, DestroyRef, ElementRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CanDeactivateFn, Router } from '@angular/router';
import { SessionService } from '../../core/session.service';
import { InstructorDegree, InstructorService } from '../../core/instructor.service';
import { finalize } from 'rxjs';

type InstructorField = 'name' | 'degree' | 'sis' | 'email' | 'phone' | 'password' | 'confirmPassword';
export const instructorDraftGuard: CanDeactivateFn<InstructorCreatePage> = page => page.canLeave();

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-instructor-create-page',
  styleUrl: './instructor-create-page.scss',
  templateUrl: './instructor-create-page.html',
})
export class InstructorCreatePage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly builder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly instructors = inject(InstructorService);
  readonly saving = signal(false);
  readonly requestError = signal('');
  readonly fieldErrors = signal<Partial<Record<InstructorField, string>>>({});
  readonly showPassword = signal(false);
  readonly showConfirmation = signal(false);
  readonly submitted = signal(false);
  readonly degrees = ['Estudiante', 'Ingeniero', 'Técnico'];
  readonly form = this.builder.group({
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    degree: ['', [Validators.required, Validators.pattern(/^(Estudiante|Ingeniero|Técnico)$/)]],
    sis: ['', [Validators.required, Validators.pattern(/^[0-9]{9}$/)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(/^(?=.*[0-9])[+0-9\s().-]+$/)]],
    password: ['', [Validators.required, Validators.minLength(12)]],
    confirmPassword: ['', Validators.required]
  });
  readonly sections: { title: string; description: string; fields: {
    id: InstructorField; label: string; type: string; autocomplete: string; placeholder: string;
  }[] }[] = [
    { title: 'Identificación', description: 'Datos personales y vínculo con la universidad.', fields: [
      { id: 'name', label: 'Nombre completo', type: 'text', autocomplete: 'name', placeholder: 'Ej. Carla Mendoza' },
      { id: 'degree', label: 'Grado', type: 'select', autocomplete: 'off', placeholder: '' },
      { id: 'sis', label: 'Código SIS', type: 'text', autocomplete: 'off', placeholder: 'Ej. 001234567' }
    ] },
    { title: 'Contacto', description: 'Información para comunicarse con el instructor.', fields: [
      { id: 'email', label: 'Correo electrónico', type: 'email', autocomplete: 'email', placeholder: 'nombre@universidad.edu' },
      { id: 'phone', label: 'Teléfono de contacto', type: 'tel', autocomplete: 'tel', placeholder: 'Ej. +591 700 12345' }
    ] },
    { title: 'Acceso', description: 'Define una contraseña de al menos 12 caracteres.', fields: [
      { id: 'password', label: 'Contraseña', type: 'password', autocomplete: 'new-password', placeholder: 'Mínimo 12 caracteres' },
      { id: 'confirmPassword', label: 'Confirmar contraseña', type: 'password', autocomplete: 'new-password', placeholder: 'Repite la contraseña' }
    ] }
  ];

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.fieldErrors.set({});
      this.requestError.set('');
    });
  }

  error(field: InstructorField): string | null {
    const control = this.form.controls[field];
    if (this.fieldErrors()[field]) return this.fieldErrors()[field]!;
    if (field === 'confirmPassword' && control.touched && control.value !== this.form.controls.password.value) return 'Las contraseñas deben coincidir.';
    if (!control.touched || control.valid) return null;
    if (control.hasError('required')) {
      return {
        name: 'El nombre completo es obligatorio.', degree: 'Selecciona un grado.',
        sis: 'El código SIS es obligatorio.', email: 'El correo electrónico es obligatorio.',
        phone: 'El teléfono de contacto es obligatorio.', password: 'La contraseña es obligatoria.', confirmPassword: 'Confirma la contraseña.'
      }[field];
    }
    return {
      name: 'Introduce el nombre completo.', degree: 'Selecciona Estudiante, Ingeniero o Técnico.',
      sis: 'El código SIS debe contener exactamente 9 dígitos.', email: 'Introduce un correo electrónico válido.',
      phone: 'Introduce un teléfono con al menos un dígito; puedes usar +, espacios, paréntesis, puntos y guiones.',
      password: 'La contraseña debe contener al menos 12 caracteres.', confirmPassword: 'Las contraseñas deben coincidir.'
    }[field];
  }

  validate() {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    this.submitted.set(true);
    if (this.form.invalid || this.form.controls.password.value !== this.form.controls.confirmPassword.value) {
      const firstInvalid = Object.entries(this.form.controls).find(([, control]) => control.invalid)?.[0] ?? 'confirmPassword';
      this.element.nativeElement.querySelector<HTMLElement>(`#${firstInvalid}`)?.focus();
      return;
    }
    this.requestError.set(''); this.fieldErrors.set({});
    const { confirmPassword, ...values } = this.form.getRawValue();
    this.saving.set(true); this.form.disable({ emitEvent: false });
    this.instructors.create({ ...values, degree: values.degree as InstructorDegree }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.saving.set(false); this.form.enable({ emitEvent: false }); })
    ).subscribe({
      next: user => {
        this.form.patchValue({ password: '', confirmPassword: '' }, { emitEvent: false });
        this.form.markAsPristine(); this.showPassword.set(false); this.showConfirmation.set(false);
        this.saving.set(false);
        this.session.addInstructor(user);
        void this.router.navigateByUrl('/instructores', { state: { instructorCreated: user.name } });
      },
      error: error => {
        this.requestError.set(error.status === 0 ? 'No se pudo conectar con el servidor. Revisa el directorio antes de reintentar para evitar un registro duplicado.' : error.error?.message || 'No se pudo crear el instructor. Inténtalo nuevamente.');
        const fields: Partial<Record<InstructorField, string>> = {};
        for (const field of error.error?.fields ?? []) {
          if (field.path in this.form.controls) fields[field.path as InstructorField] = field.message;
        }
        this.fieldErrors.set(fields);
      }
    });
  }

  canLeave() {
    if (this.session.currentUser()?.role !== 'ADMIN') return true;
    if (this.saving()) return false;
    return !this.form.dirty
      || window.confirm('¿Descartar los datos del instructor? Los cambios no se guardarán.');
  }

  cancel() {
    if (this.saving()) return;
    if (this.canLeave()) {
      this.form.markAsPristine();
      void this.router.navigateByUrl('/instructores');
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.session.currentUser()?.role === 'ADMIN' && (this.form.dirty || this.saving())) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
