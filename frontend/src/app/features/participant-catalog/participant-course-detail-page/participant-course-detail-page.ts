import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Course, CourseService } from '../../../core/course.service';
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

  readonly course = signal<Course | null>(null);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);

  constructor() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      this.course.set(null);
      this.loading.set(true);
      this.loadFailed.set(false);

      if (!id) {
        this.loadFailed.set(true);
        this.loading.set(false);
        return;
      }

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
    });
  }

  formatDate(date: string | null): string {
    if (!date) return 'Fecha por confirmar';
    return new Intl.DateTimeFormat('es-BO', { dateStyle: 'long' }).format(new Date(`${date}T00:00:00`));
  }
}
