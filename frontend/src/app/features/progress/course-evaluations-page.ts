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
  readonly editingId = signal<string | null>(null); readonly deletingId = signal<string | null>(null);
  title = ''; maxScore: number | null = 100; weight: number | null = null;
  readonly scores: Record<string, number | null> = {};
  readonly comments: Record<string, string> = {};

  constructor() { this.load(); }
  load() {
    if (!this.courseId) { this.error.set('El curso no es válido.'); this.loading.set(false); return; }
    this.loading.set(true); this.error.set('');
    forkJoin({ attendance: this.attendanceApi.list(this.courseId), evaluations: this.api.list(this.courseId), results: this.api.results(this.courseId) })
      .subscribe({ next: data => { this.courseName.set(data.attendance.course.name); this.students.set(data.attendance.students); this.evaluations.set(data.evaluations); this.results.set(data.results); this.loading.set(false); }, error: err => { this.error.set(err.error?.message ?? 'No se pudo cargar el curso.'); this.loading.set(false); } });
  }
  get weightTotal() { return this.evaluations().reduce((sum, evaluation) => sum + evaluation.weight, 0); }
  get weightsComplete() { return this.weightTotal >= 99.999999 && this.weightTotal <= 100.000001; }
  canSaveEvaluation() {
    const oldWeight = this.editingId() ? this.evaluations().find(item => item.id === this.editingId())?.weight ?? 0 : 0;
    return Boolean(this.title.trim()) && Number.isFinite(Number(this.maxScore)) && Number(this.maxScore) > 0 && Number(this.maxScore) <= 100 && Number.isFinite(Number(this.weight)) && Number(this.weight) > 0 && this.weightTotal - oldWeight + Number(this.weight) <= 100.000001;
  }
  validScore(evaluation: CourseEvaluation, student: AttendanceStudent) {
    const score = this.scoreFor(evaluation, student);
    return score !== null && score !== undefined && Number.isFinite(Number(score)) && Number(score) >= 0 && Number(score) <= evaluation.maxScore;
  }
  private scoreFor(evaluation: CourseEvaluation, student: AttendanceStudent) { const key = `${evaluation.id}:${student.enrollmentId}`; return Object.hasOwn(this.scores, key) ? this.scores[key] : this.existingScore(evaluation, student); }
  edit(evaluation: CourseEvaluation) { this.editingId.set(evaluation.id); this.title = evaluation.title; this.maxScore = evaluation.maxScore; this.weight = evaluation.weight; this.feedback.set(''); }
  cancelEdit() { this.editingId.set(null); this.title = ''; this.maxScore = 100; this.weight = null; }
  saveEvaluation() {
    if (!this.canSaveEvaluation() || this.saving()) return;
    const input = { title: this.title.trim(), maxScore: Number(this.maxScore), weight: Number(this.weight) };
    const id = this.editingId(); this.saving.set(true); this.error.set(''); this.feedback.set('');
    const request = id ? this.api.update(this.courseId, id, input) : this.api.create(this.courseId, input);
    request.subscribe({ next: () => { this.cancelEdit(); this.saving.set(false); this.feedback.set(id ? 'Evaluación actualizada correctamente.' : 'Evaluación creada correctamente.'); this.load(); }, error: err => { this.saving.set(false); this.error.set(err.error?.message ?? 'No se pudo guardar la evaluación.'); } });
  }
  remove(evaluation: CourseEvaluation) {
    if (this.saving() || this.deletingId() !== evaluation.id) return;
    this.saving.set(true); this.error.set(''); this.feedback.set('');
    this.api.remove(this.courseId, evaluation.id).subscribe({ next: () => { this.deletingId.set(null); this.saving.set(false); this.feedback.set('Evaluación eliminada correctamente.'); this.load(); }, error: err => { this.deletingId.set(null); this.saving.set(false); this.error.set(err.error?.message ?? 'No se pudo eliminar la evaluación. Si ya tiene notas, debe conservarse.'); } });
  }
  saveGrade(evaluation: CourseEvaluation, student: AttendanceStudent) {
    if (!this.validScore(evaluation, student) || this.saving()) return;
    const key = `${evaluation.id}:${student.enrollmentId}`; this.saving.set(true); this.feedback.set(''); this.error.set('');
    this.api.grade(this.courseId, evaluation.id, student.enrollmentId, Number(this.scoreFor(evaluation, student)), this.comments[key] ?? this.existingComment(evaluation, student)).subscribe({ next: () => { this.feedback.set(`Nota guardada para ${student.name}.`); this.saving.set(false); this.load(); }, error: err => { this.error.set(err.error?.message ?? `No se pudo guardar la nota de ${student.name}.`); this.saving.set(false); } });
  }
  existingScore(evaluation: CourseEvaluation, student: AttendanceStudent) { return evaluation.grades.find(grade => grade.enrollmentId === student.enrollmentId)?.score ?? null; }
  existingComment(evaluation: CourseEvaluation, student: AttendanceStudent) { return evaluation.grades.find(grade => grade.enrollmentId === student.enrollmentId)?.comment ?? ''; }
  scoreInputValue(evaluation: CourseEvaluation, student: AttendanceStudent) { const key = `${evaluation.id}:${student.enrollmentId}`; return Object.hasOwn(this.scores, key) ? this.scores[key] ?? '' : this.existingScore(evaluation, student) ?? ''; }
  commentInputValue(evaluation: CourseEvaluation, student: AttendanceStudent) { const key = `${evaluation.id}:${student.enrollmentId}`; return Object.hasOwn(this.comments, key) ? this.comments[key] : this.existingComment(evaluation, student); }
  result(student: AttendanceStudent): CourseResult | undefined { return this.results().find(row => row.enrollmentId === student.enrollmentId); }
  requirementLabel(student: AttendanceStudent, key: 'academicMet' | 'attendanceMet') { const value = this.result(student)?.requirements[key]; return value === null || value === undefined ? 'Pendiente' : value ? 'Cumple' : 'No cumple'; }
  resultStatusLabel(student: AttendanceStudent) { const status = this.result(student)?.finalStatus; return status === 'APROBADO' ? 'Aprobado' : status === 'REPROBADO' ? 'Reprobado por nota' : status === 'NO_CUMPLE_ASISTENCIA' ? 'No cumple asistencia' : 'Pendiente'; }
  recalculate() {
    if (this.saving()) return;
    this.saving.set(true); this.error.set(''); this.feedback.set('');
    this.api.calculate(this.courseId).subscribe({ next: response => { this.results.set(response.results); this.feedback.set('Resultados recalculados. Los datos incompletos permanecen pendientes.'); this.saving.set(false); }, error: err => { this.error.set(err.error?.message ?? 'No se pudieron calcular los resultados.'); this.saving.set(false); } });
  }
}
