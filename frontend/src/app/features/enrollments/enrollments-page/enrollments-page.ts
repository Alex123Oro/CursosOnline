import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Enrollment,
  EnrollmentCourseSummary,
  EnrollmentService,
} from '../../../core/enrollment.service';
import { EnrollmentStatus } from '../../../core/course.service';
import { SessionService } from '../../../core/session.service';
import { EnrollmentList } from '../enrollment-list/enrollment-list';
import { EnrollmentCoursePicker } from '../course-picker';
import { enrollmentParams, readEnrollmentQuery } from '../enrollment-navigation';

@Component({
  selector: 'app-enrollments-page',
  imports: [RouterLink, EnrollmentList, EnrollmentCoursePicker],
  templateUrl: './enrollments-page.html',
  styleUrl: './enrollments-page.scss',
})
export class EnrollmentsPage {
  readonly closedTabs: {status: EnrollmentStatus; label: string}[] = [{ status: 'CANCELADO', label: 'Canceladas' }, { status: 'RECHAZADO', label: 'Rechazadas' }, { status: 'CADUCADO', label: 'Caducadas' }];
  readonly statusLabels = { PREINSCRITO: 'preinscritos', INSCRITO: 'inscritos', CANCELADO: 'solicitudes canceladas', RECHAZADO: 'solicitudes rechazadas', CADUCADO: 'reservas caducadas' };
  private readonly api = inject(EnrollmentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly state = computed(() => readEnrollmentQuery(this.params()));
  readonly context = computed(() => enrollmentParams(this.state()));
  readonly courses = signal<EnrollmentCourseSummary[]>([]);
  readonly enrollments = signal<Enrollment[]>([]);
  readonly coursesLoading = signal(false);
  readonly coursesError = signal('');
  readonly isLoading = signal(false);
  readonly error = signal('');
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly searchText = signal('');
  private readonly courseRetry = signal(0);
  private readonly listRetry = signal(0);
  private searchTimer: number | undefined;
  readonly selectedCourse = computed(
    () => this.courses().find((course) => course.id === this.state().courseId) ?? null
  );
  readonly firstRow = computed(() => (this.total() ? (this.state().page - 1) * 20 + 1 : 0));
  readonly lastRow = computed(() => Math.min(this.state().page * 20, this.total()));
  constructor() {
    inject(DestroyRef).onDestroy(() => window.clearTimeout(this.searchTimer));
    effect((onCleanup) => {
      const user = this.session.currentUser();
      this.courseRetry();
      untracked(() => {
        this.courses.set([]);
        this.coursesError.set('');
        this.coursesLoading.set(false);
        if (user?.role !== 'ADMIN') return;
        this.coursesLoading.set(true);
        const subscription = this.api.courses().subscribe({
          next: (courses) => {
            this.courses.set(courses);
            this.coursesLoading.set(false);
          },
          error: () => {
            this.coursesError.set('No se pudieron cargar los cursos.');
            this.coursesLoading.set(false);
          },
        });
        onCleanup(() => subscription.unsubscribe());
      });
    });
    effect((onCleanup) => {
      const state = this.state();
      const user = this.session.currentUser();
      this.listRetry();
      untracked(() => {
        window.clearTimeout(this.searchTimer);
        this.searchText.set(state.search);
        this.enrollments.set([]);
        this.total.set(0);
        this.totalPages.set(1);
        this.error.set('');
        this.isLoading.set(false);
        if (user?.role !== 'ADMIN' || !state.courseId) return;
        this.isLoading.set(true);
        const subscription = this.api.listPage(state).subscribe({
          next: (page) => {
            this.enrollments.set(page.items);
            this.total.set(page.total);
            this.totalPages.set(page.totalPages);
            this.isLoading.set(false);
            if (page.page !== state.page)
              void this.router.navigate([], {
                relativeTo: this.route,
                queryParams: enrollmentParams({ ...state, page: page.page }),
                replaceUrl: true,
              });
          },
          error: (error) => {
            this.error.set(error.error?.message ?? 'No se pudieron cargar los participantes.');
            this.isLoading.set(false);
          },
        });
        onCleanup(() => subscription.unsubscribe());
      });
    });
  }
  tabQuery(status: EnrollmentStatus) {
    return enrollmentParams({ ...this.state(), status, page: 1 });
  }
  selectCourse(courseId: string) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: enrollmentParams({ ...this.state(), courseId, search: '', page: 1 }),
    });
  }
  onSearch(search: string) {
    this.searchText.set(search);
    window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: enrollmentParams({
          ...this.state(),
          search: search.trim().slice(0, 100),
          page: 1,
        }),
        replaceUrl: true,
      });
    }, 250);
  }
  changePage(delta: number) {
    const page = this.state().page + delta;
    if (!this.isLoading() && page >= 1 && page <= this.totalPages())
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: enrollmentParams({ ...this.state(), page }),
      });
  }
  retryCourses() {
    this.courseRetry.update((value) => value + 1);
  }
  retryList() {
    this.listRetry.update((value) => value + 1);
  }
}
