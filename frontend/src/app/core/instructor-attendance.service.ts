import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import type { AttendanceStatus } from './attendance.service';
import { shareReplay, Subject, tap } from 'rxjs';
export interface InstructorOption { id: string; name: string; }
export interface InstructorAttendanceRow {
  id: string; date: string; startTime: string; endTime: string; editable: boolean;
  course: { id: string; name: string; code: string }; status: AttendanceStatus | null;
  updatedAt: string | null; recordedById: string | null;
  blockedReason?: string | null;
}
export interface InstructorAttendanceData {
  instructor: InstructorOption; today: string; courses: InstructorAttendanceRow['course'][];
  sessions: InstructorAttendanceRow[]; summary: { present: number; absent: number; pending: number };
}
@Injectable({ providedIn: 'root' })
export class InstructorAttendanceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin/instructors`;
  private readonly settled = new Subject<{ instructorId: string; sessionId: string }>();
  readonly saveSettled = this.settled.asObservable();
  instructors() { return this.http.get<InstructorOption[]>(this.base); }
  list(id: string, filters: { courseId: string; from: string; to: string }) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) if (value) params = params.set(key, value);
    return this.http.get<InstructorAttendanceData>(`${this.base}/${id}/attendance`, { params });
  }
  save(id: string, sessionId: string, status: AttendanceStatus) {
    const notify = () => this.settled.next({ instructorId: id, sessionId });
    // A received write cannot be undone by cancelling its observer. Keep its
    // completion observable across page changes so the current view reconciles.
    return this.http.put<InstructorAttendanceRow>(`${this.base}/${id}/sessions/${sessionId}/attendance`, { status }).pipe(
      tap({ next: notify, error: notify }), shareReplay({ bufferSize: 1, refCount: false })
    );
  }
}
