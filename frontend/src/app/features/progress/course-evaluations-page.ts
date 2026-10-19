import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AttendanceService, AttendanceStudent } from '../../core/attendance.service';
import { CourseEvaluation, CourseResult, EvaluationService } from '../../core/evaluation.service';
import { SessionService } from '../../core/session.service';

@Component({ selector: 'app-course-evaluations-page', standalone: true, imports: [CommonModule, FormsModule, RouterLink], templateUrl: './course-evaluations-page.html', styleUrl: './course-evaluations-page.scss' })
export class CourseEvaluationsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly attendanceApi = inject(AttendanceService);
  private readonly api = inject(EvaluationService);
  readonly identity = inject(SessionService);
  readonly courseId = this.route.snapshot.paramMap.get('courseId') ?? '';
  readonly courseName = signal(''); readonly students = signal<AttendanceStudent[]>([]);
  readonly evaluations = signal<CourseEvaluation[]>([]); readonly results = signal<CourseResult[]>([]);
  readonly loading = signal(true); readonly saving = signal(false); readonly error = signal(''); readonly feedback = signal('');
  title = ''; weight: number | null = null;
  readonly scores: Record<string, number | null> = {};
  constructor() { this.load(); }
  load() {
    if (!this.courseId) { this.error.set('Curso no válido.'); this.loading.set(false); return; }
    this.loading.set(true); this.error.set('');
    forkJoin({ attendance: this.attendanceApi.list(this.courseId), evaluations: this.api.list(this.courseId), results: this.api.results(this.courseId) })
      .subscribe({ next: data => { this.courseName.set(data.attendance.course.name); this.students.set(data.attendance.students); this.evaluations.set(data.evaluations); this.results.set(data.results); this.loading.set(false); }, error: err => { this.error.set(err.error?.message ?? 'No se pudo cargar el curso.'); this.loading.set(false); } });
  }
  get weightTotal() { return this.evaluations().reduce((sum, evaluation) => sum + evaluation.weight, 0); }
  canAddEvaluation() { return Boolean(this.title.trim()) && Number.isFinite(Number(this.weight)) && Number(this.weight) > 0 && this.weightTotal + Number(this.weight) <= 100; }
  validScore(evaluation: CourseEvaluation, student: AttendanceStudent) {
    const score = this.scores[`${evaluation.id}:${student.enrollmentId}`];
    return score !== null && score !== undefined && Number.isFinite(Number(score)) && Number(score) >= 0 && Number(score) <= 100;
  }
  addEvaluation() {
    const title = this.title.trim(); const weight = Number(this.weight);
    if (!title || title.length < 2 || !Number.isFinite(weight) || weight <= 0 || this.weightTotal + weight > 100 || this.saving()) return;
    this.saving.set(true); this.feedback.set(''); this.error.set('');
    this.api.create(this.courseId, { title, maxScore: 100, weight }).subscribe({ next: () => { this.title = ''; this.weight = null; this.feedback.set('Evaluación creada.'); this.saving.set(false); this.load(); }, error: err => { this.error.set(err.error?.message ?? 'No se pudo crear la evaluación.'); this.saving.set(false); } });
  }
  saveGrade(evaluation: CourseEvaluation, student: AttendanceStudent) {
    const score = this.scores[`${evaluation.id}:${student.enrollmentId}`];
    if (score === null || score === undefined || !Number.isFinite(Number(score)) || Number(score) < 0 || Number(score) > 100 || this.saving()) return;
    this.saving.set(true); this.feedback.set(''); this.error.set('');
    this.api.grade(this.courseId, evaluation.id, student.enrollmentId, Number(score)).subscribe({ next: () => { this.feedback.set(`Nota guardada para ${student.name}.`); this.saving.set(false); this.load(); }, error: err => { this.error.set(err.error?.message ?? 'No se pudo guardar la nota.'); this.saving.set(false); } });
  }
  existingScore(evaluation: CourseEvaluation, student: AttendanceStudent) { return evaluation.grades.find(grade => grade.enrollmentId === student.enrollmentId)?.score ?? null; }
  result(student: AttendanceStudent): CourseResult | undefined { return this.results().find(row => row.enrollmentId === student.enrollmentId); }
  requirementLabel(student: AttendanceStudent, key: 'academicMet' | 'attendanceMet') {
    const value = this.result(student)?.requirements[key];
    return value === null || value === undefined ? 'Pendiente' : value ? 'Cumple' : 'No cumple';
  }
  resultStatusLabel(student: AttendanceStudent) {
    const status = this.result(student)?.finalStatus;
    return status === 'APROBADO' ? 'Aprobado' : status === 'REPROBADO' ? 'Reprobado por nota' :
      status === 'NO_CUMPLE_ASISTENCIA' ? 'No cumple asistencia' : 'Pendiente';
  }
  recalculate() {
    if (this.saving()) return;
    this.saving.set(true); this.error.set(''); this.feedback.set('');
    this.api.calculate(this.courseId).subscribe({ next: response => { this.results.set(response.results); this.feedback.set('Resultados recalculados. Los resultados incompletos permanecen pendientes.'); this.saving.set(false); }, error: err => { this.error.set(err.error?.message ?? 'No se pudieron calcular los resultados.'); this.saving.set(false); } });
  }
}
