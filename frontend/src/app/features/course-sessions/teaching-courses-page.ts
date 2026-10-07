import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/session.service';
import { CourseSessionService, SessionCourse } from '../../core/course-session.service';

@Component({ selector: 'app-teaching-courses-page', standalone: true, imports: [RouterLink], styleUrl: './teaching-courses-page.scss', templateUrl: './teaching-courses-page.html' })
export class TeachingCoursesPage {
  private readonly identity = inject(SessionService);
  private readonly api = inject(CourseSessionService);
  readonly courses = signal<SessionCourse[]>([]); readonly loading = signal(false); readonly error = signal('');
  readonly search = signal('');
  readonly page = signal(0);
  private readonly retry = signal(0);
  readonly filtered = computed(() => {
    const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const query = normalize(this.search().trim());
    return this.courses().filter(course => normalize(course.name + ' ' + (course.code ?? '')).includes(query));
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 8)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1));
  readonly visibleCourses = computed(() => this.filtered().slice(this.currentPage() * 8, (this.currentPage() + 1) * 8));
  searchCourses(value: string) { this.search.set(value); this.page.set(0); }
  changePage(delta: number) { this.page.set(Math.max(0, Math.min(this.currentPage() + delta, this.pageCount() - 1))); }
  reload() { this.retry.update(value => value + 1); }
  formatDate(date: string | null) { return date ? new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date + 'T12:00:00Z')) : 'Sin definir'; }
  constructor() {
    effect(onCleanup => {
      const user = this.identity.currentUser(); this.retry();
      untracked(() => {
        this.courses.set([]); this.error.set(''); this.loading.set(false); this.page.set(0); this.search.set('');
        if (!user) return;
        if (user.role !== 'INSTRUCTOR') { this.error.set('Esta pantalla corresponde a instructores.'); return; }
        this.loading.set(true);
        const subscription = this.api.teachingCourses().subscribe({ next: courses => { this.courses.set(courses); this.loading.set(false); }, error: error => { this.error.set(error.error?.message ?? 'No se pudieron cargar tus cursos.'); this.loading.set(false); } });
        onCleanup(() => subscription.unsubscribe());
      });
    });
  }
}
