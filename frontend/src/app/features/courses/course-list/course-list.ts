import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, computed, input, signal } from '@angular/core';
import { Course } from '../../../core/course.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-course-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './course-list.html',
  styleUrl: './course-list.scss'
})
export class CourseList {
  readonly courses = input<Course[]>([]);
  @Input() loading = false;
  @Input() saving = false;
  @Output() editCourse = new EventEmitter<Course>();
  @Output() publishCourse = new EventEmitter<Course>();
  @Output() unpublishCourse = new EventEmitter<Course>();

  readonly query = signal('');

  readonly filteredCourses = computed(() =>
    this.courses().filter(course =>
      `${course.name} ${course.code}`.toLowerCase().includes(this.query().toLowerCase())
    )
  );

  onSearch(value: string) {
    this.query.set(value);
  }
}
