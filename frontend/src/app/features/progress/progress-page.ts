import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { ProgressService, CourseProgress } from '../../core/progress.service';
import { SessionService } from '../../core/session.service';

@Component({
  selector: 'app-progress-page',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './progress-page.html',
  styleUrls: ['./learning-welcome.scss', './progress-cards.scss', './progress-page.scss']
})
export class ProgressPage {
  private readonly api = inject(ProgressService);
  private readonly session = inject(SessionService);
  readonly firstName = computed(() => this.session.currentUser()?.name.trim().split(/\s+/)[0] || 'participante');
  readonly view = (inject(ActivatedRoute).snapshot.data['view'] as 'all' | 'courses' | 'attendance' | 'grades' | 'results' | undefined) ?? 'all';
  readonly pageTitle = this.view === 'attendance' ? 'Mi asistencia' : this.view === 'grades' ? 'Mis calificaciones' : this.view === 'results' ? 'Mis resultados' : this.view === 'courses' ? 'Mis cursos' : 'Mi progreso';
  readonly items = signal<CourseProgress[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly confirmedCount = computed(() => this.items().filter(item => item.enrollmentStatus === 'INSCRITO').length);
  readonly pendingCount = computed(() => this.items().filter(item => item.enrollmentStatus === 'PREINSCRITO').length);
  readonly passedCount = computed(() => this.items().filter(item => item.finalStatus === 'APROBADO').length);
  readonly subtitle = this.view === 'attendance' ? 'Cada sesión cuenta. Consulta tu asistencia y las marcas registradas.'
    : this.view === 'grades' ? 'Sigue tus evaluaciones y conoce cómo se construye tu nota.'
    : this.view === 'results' ? 'Consulta tus resultados y los requisitos para certificar tu formación.'
    : 'Tu formación, en un solo lugar. Sigue aprendiendo a tu ritmo.';
  readonly tabs = [
    { path: '/mis-cursos', label: 'Mis cursos' }, { path: '/mi-progreso', label: 'Vista general' },
    { path: '/mi-asistencia', label: 'Asistencia' }, { path: '/mis-calificaciones', label: 'Calificaciones' },
    { path: '/mis-resultados', label: 'Resultados' }
  ];

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
