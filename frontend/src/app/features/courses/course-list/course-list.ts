import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { Course } from '../../../core/course.service';

@Component({
  selector: 'app-course-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './course-list.html',
  styleUrl: './course-list.scss'
})
export class CourseList {
  @Input() courses: Course[] = [];
  @Input() loading = false;
  @Output() editCourse = new EventEmitter<Course>();
  @Output() publishCourse = new EventEmitter<Course>();

  readonly query = signal('');

  readonly filteredCourses = computed(() =>
    this.courses.filter(course =>
      `${course.name} ${course.code}`.toLowerCase().includes(this.query().toLowerCase())
    )
  );

  onSearch(value: string) {
    this.query.set(value);
  }
}
