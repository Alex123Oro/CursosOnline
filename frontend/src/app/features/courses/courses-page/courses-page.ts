import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { switchMap } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Course, CoursePayload, CoursePricesPayload, CourseService, ParticipantType } from '../../../core/course.service';
import { CourseForm } from '../course-form/course-form';
import { CourseList } from '../course-list/course-list';
import { SessionService } from '../../../core/session.service';

type FormMode = 'create' | 'edit';

@Component({
  selector: 'app-courses-page',
  standalone: true,
  imports: [CommonModule, CourseList, CourseForm],
  templateUrl: './courses-page.html',
  styleUrl: './courses-page.scss'
})
export class CoursesPage {
  private readonly courseService = inject(CourseService);
  private readonly session = inject(SessionService);

  readonly courses = signal<Course[]>([]);
  readonly participantTypes = signal<ParticipantType[]>([]);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly isFormOpen = signal(false);
  readonly formMode = signal<FormMode>('create');
  readonly editingCourse = signal<Course | null>(null);
  readonly feedback = signal('');
  readonly publishedCount = computed(() => this.courses().filter(course => course.status === 'PUBLISHED').length);
  readonly openEnrollmentCount = computed(() => this.courses().filter(course =>
    course.status === 'PUBLISHED' && (course.remainingSlots === null || course.remainingSlots > 0)
  ).length);
  readonly periodCount = computed(() => this.courses().filter(course => course.preinscriptionStart && course.preinscriptionEnd).length);

  constructor() {
    effect(onCleanup => {
      const user = this.session.currentUser();
      this.courses.set([]);
      this.feedback.set('');
      this.isLoading.set(false);
      this.closeForm();
      if (!user) return;
      const subscription = untracked(() => this.loadCourses());
      onCleanup(() => subscription.unsubscribe());
    });
    this.courseService.participantTypes().subscribe({
      next: types => this.participantTypes.set(types)
    });
  }

  openCreateForm() {
    this.formMode.set('create');
    this.editingCourse.set(null);
    this.feedback.set('');
    this.isFormOpen.set(true);
  }

  openEditForm(course: Course) {
    this.formMode.set('edit');
    this.editingCourse.set(course);
    this.feedback.set('');
    this.isFormOpen.set(true);
  }

  closeForm() {
    this.isFormOpen.set(false);
  }

  handleSave(payload: { course: CoursePayload; prices: CoursePricesPayload }) {
    const editing = this.editingCourse();
    const request = editing
      ? this.courseService.update(editing.id, payload.course)
      : this.courseService.create(payload.course);

    this.isSaving.set(true);
    request.pipe(
      switchMap(course => this.courseService.replacePrices(course.id, payload.prices)),
      finalize(() => this.isSaving.set(false))
    ).subscribe({
      next: () => {
        this.feedback.set(editing ? 'Curso actualizado correctamente.' : 'Curso registrado correctamente.');
        this.closeForm();
        this.loadCourses();
      },
      error: error => this.feedback.set(this.errorMessage(error))
    });
  }

  publishCourse(course: Course) {
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

  private loadCourses() {
    this.isLoading.set(true);
    return this.courseService.list()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: courses => this.courses.set(courses),
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
