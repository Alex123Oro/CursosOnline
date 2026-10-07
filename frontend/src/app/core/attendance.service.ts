import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export type AttendanceStatus = 'PRESENT' | 'ABSENT';
export interface AttendanceRecord { sessionId: string; status: AttendanceStatus; updatedAt: string; }
export interface AttendanceStudent {
  enrollmentId: string; participantId: string; name: string; percentage: number | null;
  presentCount: number; absentCount: number; pendingCount: number; attendance: AttendanceRecord[];
}
export interface AttendanceSession { id: string; date: string; startTime: string; endTime: string; editable: boolean; }
export interface AttendanceData {
  course: { id: string; code: string; name: string; instructor: string }; today: string;
  sessions: AttendanceSession[]; students: AttendanceStudent[];
}
@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;
  list(courseId: string) { return this.http.get<AttendanceData>(`${this.base}/courses/${courseId}/attendance`); }
  save(courseId: string, sessionId: string, enrollmentId: string, status: AttendanceStatus) {
    return this.http.put<AttendanceStudent>(`${this.base}/courses/${courseId}/sessions/${sessionId}/attendance/${enrollmentId}`, { status });
  }
}
