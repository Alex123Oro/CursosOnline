import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';

export interface CourseProgress {
  enrollmentId: string;
  enrollmentStatus: 'PREINSCRITO' | 'INSCRITO';
  course: { id: string; code: string; name: string; startDate: string | null; endDate: string | null };
  attendance: { presentSessions: number; completedSessions: number; percentage: number | null };
  evaluations: { id: string; title: string; score: number | null; maxScore: number; weight: number; comment: string | null; gradedAt: string | null; percentage: number | null }[];
  currentGrade: number | null;
  finalGrade: number | null;
  minimumPassingScore: number;
  requirements: { academicMet: boolean | null; attendanceMet: boolean | null; minimumAttendancePercent: number };
  finalStatus: 'APROBADO' | 'REPROBADO' | 'NO_CUMPLE_ASISTENCIA' | null;
  certificateEligible: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly http = inject(HttpClient);

  mine() {
    return this.http.get<CourseProgress[]>(`${environment.apiBaseUrl}/progress/me`);
  }
}
