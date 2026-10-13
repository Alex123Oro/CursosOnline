import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CanDeactivateFn, Router } from '@angular/router';
import { SessionService } from '../../core/session.service';

type InstructorField = 'name' | 'degree' | 'sis' | 'email' | 'phone';
export const instructorDraftGuard: CanDeactivateFn<InstructorCreatePage> = page => page.canLeave();

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-instructor-create-page',
  styleUrl: './instructor-create-page.scss',
  templateUrl: './instructor-create-page.html',
})
export class InstructorCreatePage {
  private readonly builder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly validated = signal(false);
  readonly submitted = signal(false);
  readonly degrees = ['Estudiante', 'Ingeniero', 'Técnico'];
  readonly form = this.builder.group({
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    degree: ['', [Validators.required, Validators.pattern(/^(Estudiante|Ingeniero|Técnico)$/)]],
    sis: ['', [Validators.required, Validators.pattern(/^[0-9]{9}$/)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(/^(?=.*[0-9])[+0-9\s().-]+$/)]]
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
    ] }
  ];

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.validated.set(false));
  }

  error(field: InstructorField): string | null {
    const control = this.form.controls[field];
    if (!control.touched || control.valid) return null;
    if (control.hasError('required')) {
      return {
        name: 'El nombre completo es obligatorio.', degree: 'Selecciona un grado.',
        sis: 'El código SIS es obligatorio.', email: 'El correo electrónico es obligatorio.',
        phone: 'El teléfono de contacto es obligatorio.'
      }[field];
    }
    return {
      name: 'Introduce el nombre completo.', degree: 'Selecciona Estudiante, Ingeniero o Técnico.',
      sis: 'El código SIS debe contener exactamente 9 dígitos.', email: 'Introduce un correo electrónico válido.',
      phone: 'Introduce un teléfono con al menos un dígito; puedes usar +, espacios, paréntesis, puntos y guiones.'
    }[field];
  }

  validate() {
    this.form.markAllAsTouched();
    this.submitted.set(true);
    this.validated.set(this.form.valid);
    if (this.form.invalid) {
      const firstInvalid = Object.entries(this.form.controls).find(([, control]) => control.invalid)?.[0];
      this.element.nativeElement.querySelector<HTMLElement>(`#${firstInvalid}`)?.focus();
    }
  }

  canLeave() {
    return this.session.currentUser()?.role !== 'ADMIN' || !this.form.dirty
      || window.confirm('¿Descartar los datos del instructor? Los cambios no se guardarán.');
  }

  cancel() {
    if (this.canLeave()) {
      this.form.markAsPristine();
      void this.router.navigateByUrl('/instructores');
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.form.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
