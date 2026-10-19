import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface EvaluationGrade { enrollmentId: string; participantName: string; score: number; comment: string | null; gradedAt: string; }
export interface CourseEvaluation { id: string; title: string; maxScore: number; weight: number; grades: EvaluationGrade[]; }
export interface CourseResult {
  enrollmentId: string; participantId: string; participantName: string; attendance: { percentage: number | null };
  currentGrade: number | null; finalGrade: number | null; finalStatus: 'APROBADO' | 'REPROBADO' | 'NO_CUMPLE_ASISTENCIA' | null;
  requirements: { academicMet: boolean | null; attendanceMet: boolean | null; minimumAttendancePercent: number };
}
export interface EvaluationInput { title: string; maxScore: number; weight: number; }

@Injectable({ providedIn: 'root' })
export class EvaluationService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;
  list(courseId: string) { return this.http.get<CourseEvaluation[]>(`${this.base}/courses/${courseId}/evaluations`); }
  create(courseId: string, input: EvaluationInput) { return this.http.post<CourseEvaluation>(`${this.base}/courses/${courseId}/evaluations`, input); }
  grade(courseId: string, evaluationId: string, enrollmentId: string, score: number, comment?: string) {
    return this.http.put<{ score: number; gradedAt: string }>(`${this.base}/courses/${courseId}/evaluations/${evaluationId}/grades/${enrollmentId}`, { score, comment });
  }
  results(courseId: string) { return this.http.get<CourseResult[]>(`${this.base}/progress/courses/${courseId}/results`); }
  calculate(courseId: string) { return this.http.post<{ results: CourseResult[] }>(`${this.base}/progress/courses/${courseId}/results/calculate`, {}); }
}
