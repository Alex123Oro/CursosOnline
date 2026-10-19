import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { ProgressService, CourseProgress } from '../../core/progress.service';

@Component({
  selector: 'app-progress-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './progress-page.html',
  styleUrl: './progress-page.scss'
})
export class ProgressPage {
  private readonly api = inject(ProgressService);
  readonly view = (inject(ActivatedRoute).snapshot.data['view'] as 'all' | 'courses' | 'attendance' | 'grades' | 'results' | undefined) ?? 'all';
  readonly pageTitle = this.view === 'attendance' ? 'Mi asistencia' : this.view === 'grades' ? 'Mis calificaciones' : this.view === 'results' ? 'Mis resultados' : this.view === 'courses' ? 'Mis cursos' : 'Mi progreso';
  readonly items = signal<CourseProgress[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() { this.load(); }

  load() {
    this.loading.set(true); this.error.set('');
    this.api.mine().subscribe({
      next: items => { this.items.set(items); this.loading.set(false); },
      error: error => { this.error.set(this.errorMessage(error)); this.loading.set(false); }
    });
  }

  enrollmentLabel(status: CourseProgress['enrollmentStatus']) {
    return status === 'INSCRITO' ? 'Inscrito' : 'Preinscrito';
  }

  resultLabel(status: CourseProgress['finalStatus']) {
    return status === 'APROBADO' ? 'Aprobado' : status === 'REPROBADO' ? 'Reprobado por nota' : status === 'NO_CUMPLE_ASISTENCIA' ? 'No cumple la asistencia mínima' : 'Pendiente';
  }

  formatDate(value: string | null) {
    return value ? new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${value}T12:00:00Z`)) : 'Por confirmar';
  }

  private errorMessage(error: unknown) {
    if (error instanceof HttpErrorResponse) return error.error?.message ?? 'No se pudo cargar tu progreso.';
    return 'No se pudo cargar tu progreso.';
  }
}
