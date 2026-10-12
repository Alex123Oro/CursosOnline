import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ProgressService, CourseProgress } from '../../core/progress.service';

@Component({
  selector: 'app-progress-page',
  standalone: true,
  templateUrl: './progress-page.html',
  styleUrl: './progress-page.scss'
})
export class ProgressPage {
  private readonly api = inject(ProgressService);
  readonly items = signal<CourseProgress[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    this.api.mine().subscribe({
      next: items => { this.items.set(items); this.loading.set(false); },
      error: error => { this.error.set(this.errorMessage(error)); this.loading.set(false); }
    });
  }

  enrollmentLabel(status: CourseProgress['enrollmentStatus']) {
    return status === 'INSCRITO' ? 'Inscrito' : 'Preinscrito';
  }

  formatDate(value: string | null) {
    return value ? new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${value}T12:00:00Z`)) : 'Por confirmar';
  }

  private errorMessage(error: unknown) {
    if (error instanceof HttpErrorResponse) return error.error?.message ?? 'No se pudo cargar tu progreso.';
    return 'No se pudo cargar tu progreso.';
  }
}