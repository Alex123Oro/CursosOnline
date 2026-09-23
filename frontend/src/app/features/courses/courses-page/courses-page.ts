import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { Course, CoursePayload, CourseService } from '../../../core/course.service';
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
  private readonly courseService = inject(CourseService);

  readonly courses = signal<Course[]>([]);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly isFormOpen = signal(false);
  readonly formMode = signal<FormMode>('create');
  readonly editingCourse = signal<Course | null>(null);
  readonly feedback = signal('');

  constructor() {
    this.loadCourses();
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

  handleSave(payload: CoursePayload) {
    const editing = this.editingCourse();
    const request = editing
      ? this.courseService.update(editing.id, payload)
      : this.courseService.create(payload);

    this.isSaving.set(true);
    request.pipe(finalize(() => this.isSaving.set(false))).subscribe({
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
    this.courseService.list()
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
