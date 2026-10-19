import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { Course, CourseService } from '../../core/course.service';
import { InstructorAttendanceService, InstructorOption } from '../../core/instructor-attendance.service';
import { AcademicManagementService, InstructorAssignment } from '../../core/academic-management.service';

@Component({ selector: 'app-instructor-assignments-page', standalone: true, imports: [FormsModule], templateUrl: './instructor-assignments-page.html', styleUrl: './instructor-assignments-page.scss' })
export class InstructorAssignmentsPage {
  private readonly coursesApi = inject(CourseService);
  private readonly instructorsApi = inject(InstructorAttendanceService);
  private readonly api = inject(AcademicManagementService);
  readonly courses = signal<Course[]>([]); readonly instructors = signal<InstructorOption[]>([]);
  readonly assignments = signal<InstructorAssignment[]>([]); readonly loading = signal(true);
  readonly saving = signal(false); readonly error = signal(''); readonly feedback = signal('');
  courseId = ''; instructorId = '';
  constructor() { this.load(); }
  load() {
    this.loading.set(true); this.error.set('');
    forkJoin({ courses: this.coursesApi.list(), instructors: this.instructorsApi.instructors(), assignments: this.api.assignments() })
      .subscribe({ next: data => { this.courses.set(data.courses); this.instructors.set(data.instructors); this.assignments.set(data.assignments); this.loading.set(false); }, error: err => { this.error.set(err.error?.message ?? 'No se pudieron cargar los datos.'); this.loading.set(false); } });
  }
  save() {
    if (!this.courseId || !this.instructorId || this.saving()) return;
    this.saving.set(true); this.feedback.set(''); this.error.set('');
    this.api.assign(this.courseId, this.instructorId).subscribe({ next: assignment => { this.assignments.update(rows => [...rows, assignment]); this.courseId = ''; this.instructorId = ''; this.feedback.set('Instructor asignado correctamente.'); this.saving.set(false); }, error: err => { this.error.set(err.error?.message ?? 'No se pudo guardar la asignación.'); this.saving.set(false); } });
  }
  change(row: InstructorAssignment, instructorId: string) {
    if (!instructorId || instructorId === String(row.instructor.id) || this.saving()) return;
    this.saving.set(true); this.error.set(''); this.feedback.set('');
    this.api.change(row.id, instructorId).subscribe({ next: updated => { this.assignments.update(rows => rows.map(item => item.id === row.id ? updated : item)); this.feedback.set('Asignación actualizada.'); this.saving.set(false); }, error: err => { this.error.set(err.error?.message ?? 'No se pudo cambiar el instructor.'); this.saving.set(false); } });
  }
  courseAssigned(courseId: string) { return this.assignments().some(row => String(row.course.id) === courseId); }
}
