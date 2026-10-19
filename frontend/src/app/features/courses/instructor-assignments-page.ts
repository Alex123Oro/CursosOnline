import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Course, CourseService } from '../../core/course.service';
import { InstructorAttendanceService, InstructorOption } from '../../core/instructor-attendance.service';
import { AcademicManagementService, InstructorAssignment } from '../../core/academic-management.service';

@Component({ selector: 'app-instructor-assignments-page', standalone: true, imports: [CommonModule, FormsModule, RouterLink], templateUrl: './instructor-assignments-page.html', styleUrl: './instructor-assignments-page.scss' })
export class InstructorAssignmentsPage {
  private readonly coursesApi = inject(CourseService);
  private readonly instructorsApi = inject(InstructorAttendanceService);
  private readonly api = inject(AcademicManagementService);
  readonly courses = signal<Course[]>([]); readonly instructors = signal<InstructorOption[]>([]);
  readonly assignments = signal<InstructorAssignment[]>([]); readonly loading = signal(true);
  readonly saving = signal(false); readonly error = signal(''); readonly feedback = signal('');
  readonly deletingId = signal<number | null>(null); readonly editingId = signal<number | null>(null);
  readonly editInstructorId = signal('');
  courseId = ''; instructorId = '';

  constructor() { this.load(); }
  load() {
    this.loading.set(true); this.error.set('');
    forkJoin({ courses: this.coursesApi.list(), instructors: this.instructorsApi.instructors(), assignments: this.api.assignments() })
      .subscribe({ next: data => { this.courses.set(data.courses); this.instructors.set(data.instructors); this.assignments.set(data.assignments); this.loading.set(false); }, error: err => { this.error.set(err.error?.message ?? 'No se pudieron cargar los datos.'); this.loading.set(false); } });
  }
  save() {
    if (!this.courseId || !this.instructorId || this.saving() || this.assignmentExists(this.courseId, this.instructorId)) return;
    this.saving.set(true); this.feedback.set(''); this.error.set('');
    this.api.assign(this.courseId, this.instructorId).subscribe({ next: assignment => { this.assignments.update(rows => [...rows, assignment]); this.courseId = ''; this.instructorId = ''; this.feedback.set('Instructor asignado correctamente.'); this.saving.set(false); }, error: err => { this.error.set(err.error?.message ?? 'No se pudo guardar la asignación.'); this.saving.set(false); } });
  }
  startEdit(row: InstructorAssignment) { if (this.saving()) return; this.editingId.set(row.id); this.editInstructorId.set(String(row.instructor.id)); this.deletingId.set(null); }
  cancelEdit() { if (!this.saving()) { this.editingId.set(null); this.editInstructorId.set(''); } }
  saveEdit(row: InstructorAssignment) {
    const instructorId = this.editInstructorId();
    if (!instructorId || instructorId === String(row.instructor.id) || this.saving() || this.editingId() !== row.id) return;
    this.saving.set(true); this.error.set(''); this.feedback.set('');
    this.api.change(row.id, instructorId).subscribe({ next: updated => { this.assignments.update(rows => rows.map(item => item.id === row.id ? updated : item)); this.feedback.set('Asignación actualizada.'); this.saving.set(false); this.editingId.set(null); this.editInstructorId.set(''); }, error: err => { this.error.set(err.error?.message ?? 'No se pudo cambiar el instructor.'); this.saving.set(false); } });
  }
  assignmentExists(courseId: string | number, instructorId: string | number) { return this.assignments().some(row => String(row.course.id) === String(courseId) && String(row.instructor.id) === String(instructorId)); }
  isSameInstructor(left: string | number, right: string | number) { return String(left) === String(right); }
  confirmRemove(row: InstructorAssignment) { if (this.saving()) return; this.deletingId.set(row.id); this.editingId.set(null); }
  cancelRemove() { if (!this.saving()) this.deletingId.set(null); }
  remove(row: InstructorAssignment) {
    if (this.saving() || this.deletingId() !== row.id) return;
    this.saving.set(true); this.error.set(''); this.feedback.set('');
    this.api.remove(row.id).subscribe({ next: () => { this.assignments.update(rows => rows.filter(item => item.id !== row.id)); this.saving.set(false); this.deletingId.set(null); this.feedback.set('Asignación eliminada correctamente.'); }, error: err => { this.saving.set(false); this.error.set(err.error?.message ?? 'No se pudo eliminar la asignación.'); } });
  }
}
