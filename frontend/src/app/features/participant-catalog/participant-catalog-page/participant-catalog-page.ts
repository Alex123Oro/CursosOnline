import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Course, CourseService } from '../../../core/course.service';
import { ParticipantHeader } from '../shared/participant-header/participant-header';

@Component({
  selector: 'app-participant-catalog-page',
  standalone: true,
  imports: [RouterLink, ParticipantHeader],
  templateUrl: './participant-catalog-page.html',
  styleUrl: './participant-catalog-page.scss'
})
export class ParticipantCatalogPage {
  private readonly courseService = inject(CourseService);
  readonly query = signal('');
  readonly courses = signal<Course[]>([]);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly filteredCourses = computed(() => {
    const term = this.query().trim().toLocaleLowerCase();
    return this.courses().filter(course => {
      const searchableCourse = `${course.name} ${course.code} ${course.instructor}`.toLocaleLowerCase();
      return !term || searchableCourse.includes(term);
    });
  });

  constructor() {
    this.courseService.catalog().subscribe({
      next: courses => {
        this.courses.set(courses);
        this.loading.set(false);
      },
      error: () => {
        this.loadFailed.set(true);
        this.loading.set(false);
      }
    });
  }

  onSearch(value: string) { this.query.set(value); }
  clearFilters() { this.query.set(''); }
}
