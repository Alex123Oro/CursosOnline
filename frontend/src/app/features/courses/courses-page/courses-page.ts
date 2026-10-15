import { CommonModule, Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, of, switchMap } from 'rxjs';
import { Course, CoursePayload, CourseService, ParticipantTypeOption } from '../../../core/course.service';
import { InstructorAttendanceService, InstructorOption } from '../../../core/instructor-attendance.service';
import { CourseForm } from '../course-form/course-form';
import { CourseList } from '../course-list/course-list';

type FormMode = 'create' | 'edit';

@Component({
  selector: 'app-courses-page',
  standalone: true,
  imports: [CommonModule, CourseList, CourseForm],
  templateUrl: './courses-page.html',
  styleUrl: './courses-page.scss'
})
export class CoursesPage {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  readonly isCreatePage = this.route.snapshot.data['createCourse'] === true;
  readonly isEditPage = this.route.snapshot.data['editCourse'] === true;
  readonly isFormPage = this.isCreatePage || this.isEditPage;
  private readonly courseService = inject(CourseService);
  private readonly instructorService = inject(InstructorAttendanceService);
  private createdCourseId: string | null = null;
  readonly instructors = signal<InstructorOption[]>([]);
  readonly instructorsLoading = signal(false);
  readonly instructorsError = signal('');

  readonly courses = signal<Course[]>([]);
  // Match the date-only rule used by the preinscription API.
  private readonly today = signal(new Date().toISOString().slice(0, 10));
  readonly publishedCount = computed(() => this.courses().filter(course => course.status === 'PUBLISHED').length);
  readonly draftCount = computed(() => this.courses().filter(course => course.status === 'DRAFT').length);
  readonly openPreinscriptionCount = computed(() => this.courses().filter(course =>
    course.status === 'PUBLISHED'
    && course.preinscriptionStart && course.preinscriptionEnd
    && course.preinscriptionStart <= this.today() && this.today() <= course.preinscriptionEnd
    && course.capacity != null && course.capacity > 0 && course.occupiedSlots < course.capacity
  ).length);
  readonly participantTypes = signal<ParticipantTypeOption[]>([]);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly isFormOpen = signal(false);
  readonly formMode = signal<FormMode>('create');
  readonly editingCourse = signal<Course | null>(null);
  readonly feedback = signal('');

  constructor() {
    if (!this.isFormPage) {
      const clock = window.setInterval(() => this.today.set(new Date().toISOString().slice(0, 10)), 60_000);
      inject(DestroyRef).onDestroy(() => window.clearInterval(clock));
    }
    if (this.isCreatePage) this.isFormOpen.set(true);
    else {
      const state = this.location.getState() as { feedback?: string };
      this.feedback.set(this.router.currentNavigation()?.extras.state?.['feedback'] ?? state?.feedback ?? '');
      this.loadCourses();
    }
    this.loadInstructors();
    this.courseService.participantTypes().subscribe({ next: types => this.participantTypes.set(types), error: error => this.feedback.set(this.errorMessage(error)) });
  }

  loadInstructors() {
    if (this.instructorsLoading()) return;
    this.instructorsLoading.set(true);
    this.instructorsError.set('');
    this.instructorService.instructors().pipe(finalize(() => this.instructorsLoading.set(false))).subscribe({
      next: instructors => this.instructors.set(instructors),
      error: error => this.instructorsError.set(this.errorMessage(error))
    });
  }

  openCreateForm() {
    void this.router.navigateByUrl('/cursos/nuevo');
  }

  openEditForm(course: Course) {
    void this.router.navigateByUrl(`/cursos/${course.id}/editar`);
  }

  closeForm() {
    if (this.isSaving()) return;
    if (this.isFormPage) {
      void this.router.navigateByUrl('/cursos');
      return;
    }
    this.isFormOpen.set(false);
  }

  handleSave(payload: CoursePayload) {
    if (this.isSaving()) return;
    this.feedback.set('');
    const editing = this.editingCourse();
    const prices = payload.prices ?? [];
    const existingId = editing?.id ?? this.createdCourseId;
    const request = existingId
      ? this.courseService.update(existingId, payload)
      : this.courseService.create(payload);

    this.isSaving.set(true);
    request.pipe(switchMap(course => {
      if (!editing) this.createdCourseId = course.id;
      return prices.length ? this.courseService.replacePrices(course.id, prices) : of(course);
    }), finalize(() => this.isSaving.set(false))).subscribe({
      next: saved => {
        this.feedback.set(editing ? 'Curso actualizado correctamente.' : 'Curso registrado correctamente.');
        this.isFormOpen.set(false);
        this.createdCourseId = null;
        if (this.isCreatePage) {
          void this.router.navigate(['/cursos', saved.id, 'sesiones'], { queryParams: { plan: 'weekly' }, state: { feedback: this.feedback() } });
        } else if (this.isEditPage) {
          void this.router.navigateByUrl('/cursos', { state: { feedback: this.feedback() } });
        } else this.loadCourses();
      },
      error: error => this.feedback.set(this.errorMessage(error))
    });
  }

  publishCourse(course: Course) {
    if (this.isSaving()) return;
    this.isSaving.set(true);
    this.courseService.publish(course.id)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: () => {
          this.feedback.set('Curso publicado correctamente.');
          this.loadCourses();
        },
        error: error => this.feedback.set(this.errorMessage(error))
      });
  }

  unpublishCourse(course: Course) {
    if (this.isSaving()) return;
    this.isSaving.set(true);
    this.feedback.set('');
    this.courseService.unpublish(course.id)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: () => {
          this.feedback.set('Curso devuelto a borrador. Puedes corregirlo y publicarlo nuevamente.');
          this.loadCourses();
        },
        error: error => this.feedback.set(this.errorMessage(error))
      });
  }

  private loadCourses() {
    this.isLoading.set(true);
    this.courseService.list()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: courses => {
          this.courses.set(courses);
          if (this.isEditPage) {
            const course = courses.find(course => course.id === this.route.snapshot.paramMap.get('courseId'));
            if (!course) { this.feedback.set('No se encontró el curso que quieres editar.'); return; }
            this.formMode.set('edit'); this.editingCourse.set(course); this.isFormOpen.set(true);
          }
        },
        error: error => this.feedback.set(this.errorMessage(error))
      });
  }

  private errorMessage(error: unknown) {
    if (error instanceof HttpErrorResponse) {
      const fields = error.error?.fields as { message: string }[] | undefined;
      if (fields?.length) return fields.map(field => field.message).join(' ');
      return error.error?.message ?? 'No se pudo completar la operación.';
    }

    return 'No se pudo completar la operación.';
  }
}
