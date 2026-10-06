import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/session.service';
import { CourseSessionService, SessionCourse } from '../../core/course-session.service';

@Component({ selector: 'app-teaching-courses-page', standalone: true, imports: [RouterLink], styleUrl: './course-sessions-page.scss', template: `
  <section class="sessions-page"><header class="page-header"><div><p class="eyebrow">INSTRUCTOR</p><h1>Mis cursos</h1><p class="subtitle">Organiza las sesiones de tus cursos publicados.</p></div></header>
  @if (loading()) { <p role="status">Cargando cursos…</p> } @if (error()) { <p class="feedback" role="alert">{{ error() }}</p> }
  @if (!loading() && !error()) { <div class="table-card"><table><caption>Cursos asignados</caption><thead><tr><th>Curso</th><th>Periodo</th><th>Acción</th></tr></thead><tbody>
  @for (course of courses(); track course.id) { <tr><td>{{ course.name }}<br>{{ course.code }}</td><td>{{ course.startDate }} — {{ course.endDate }}</td><td><a class="back-link" [routerLink]="['/cursos', course.id, 'sesiones']">Sesiones</a> · <a class="back-link" [routerLink]="['/cursos', course.id, 'asistencia']">Asistencia</a></td></tr> }
  @empty { <tr><td colspan="3">No tienes cursos publicados asignados. Solicita la asignación al administrador.</td></tr> }
  </tbody></table></div> }</section>` })
export class TeachingCoursesPage {
  private readonly identity = inject(SessionService);
  private readonly api = inject(CourseSessionService);
  readonly courses = signal<SessionCourse[]>([]); readonly loading = signal(false); readonly error = signal('');
  constructor() {
    effect(onCleanup => {
      const user = this.identity.currentUser();
      untracked(() => {
        this.courses.set([]); this.error.set(''); this.loading.set(false);
        if (!user) return;
        if (user.role !== 'INSTRUCTOR') { this.error.set('Esta pantalla corresponde a instructores.'); return; }
        this.loading.set(true);
        const subscription = this.api.teachingCourses().subscribe({ next: courses => { this.courses.set(courses); this.loading.set(false); }, error: error => { this.error.set(error.error?.message ?? 'No se pudieron cargar tus cursos.'); this.loading.set(false); } });
        onCleanup(() => subscription.unsubscribe());
      });
    });
  }
}
