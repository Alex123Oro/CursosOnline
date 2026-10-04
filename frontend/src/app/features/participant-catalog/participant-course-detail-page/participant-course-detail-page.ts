import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Course, CourseService } from '../../../core/course.service';
import { SessionService } from '../../../core/session.service';
import { ParticipantHeader } from '../shared/participant-header/participant-header';

@Component({
  selector: 'app-participant-course-detail-page',
  standalone: true,
  imports: [RouterLink, ParticipantHeader],
  templateUrl: './participant-course-detail-page.html',
  styleUrl: './participant-course-detail-page.scss'
})
export class ParticipantCourseDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly courseService = inject(CourseService);
  readonly session = inject(SessionService);

  readonly course = signal<Course | null>(null);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly saving = signal(false);
  readonly feedback = signal('');
  readonly courseId = signal<string | null>(null);

  readonly applicablePrice = computed(() => {
    const course = this.course();
    const typeId = this.session.currentUser()?.participantTypeId;
    if (!course || !typeId) return course?.prices[0] ?? null;
    return course.prices.find(price => price.participantTypeId === typeId) ?? null;
  });

  constructor() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      this.courseId.set(id);
      this.course.set(null);
      this.loading.set(true);
      this.loadFailed.set(false);
      this.feedback.set('');

      if (!id) {
        this.loadFailed.set(true);
        this.loading.set(false);
        return;
      }

      this.loadCourse(id);
    });
  }

  formatDate(date: string | null): string {
    if (!date) return 'Fecha por confirmar';
    return new Intl.DateTimeFormat('es-BO', { dateStyle: 'long' }).format(new Date(`${date}T00:00:00`));
  }

  periodClosed(course: Course) {
    if (!course.preinscriptionStart || !course.preinscriptionEnd) return true;
    const today = new Date().toISOString().slice(0, 10);
    return today < course.preinscriptionStart || today > course.preinscriptionEnd;
  }

  noSlots(course: Course) {
    return course.remainingSlots !== null && course.remainingSlots <= 0;
  }

  preenroll() {
    const id = this.courseId();
    if (!id) return;

    this.saving.set(true);
    this.courseService.preenroll(id).subscribe({
      next: () => {
        this.feedback.set('Preinscripción realizada correctamente.');
        this.saving.set(false);
        this.loadCourse(id);
      },
      error: error => {
        this.saving.set(false);
        this.feedback.set(this.errorMessage(error));
      }
    });
  }

  private loadCourse(id: string) {
    this.courseService.catalogById(id).subscribe({
      next: course => {
        this.course.set(course);
        this.loading.set(false);
      },
      error: () => {
        this.loadFailed.set(true);
        this.loading.set(false);
      }
    });
  }

  private errorMessage(error: unknown) {
    if (error instanceof HttpErrorResponse) {
      return error.error?.message ?? 'No se pudo completar la operación.';
    }

    return 'No se pudo completar la operación.';
  }
}
