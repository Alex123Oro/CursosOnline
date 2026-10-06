import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface SessionCourse {
  id: string; code: string; name: string; instructor: string; instructorId: string | null;
  startDate: string | null; endDate: string | null;
}
export interface SessionPayload { date: string; startTime: string; durationMinutes: number; }
export interface CourseSession extends SessionPayload {
  id: string; courseId: string; endTime: string; warning: string | null; createdAt: string; updatedAt: string;
}
export interface CourseSessions { course: SessionCourse; sessions: CourseSession[]; }
export interface SchedulePayload { startDate: string; endDate: string; weekdays: number[]; startTime: string; durationMinutes: number; }
export interface ScheduleResult { sessions: CourseSession[]; createdCount: number; skippedCount: number; }
@Injectable({ providedIn: 'root' })
export class CourseSessionService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;
  list(courseId: string) { return this.http.get<CourseSessions>(`${this.base}/courses/${courseId}/sessions`); }
  create(courseId: string, payload: SessionPayload) { return this.http.post<CourseSession>(`${this.base}/courses/${courseId}/sessions`, payload); }
  schedule(courseId: string, payload: SchedulePayload) { return this.http.post<ScheduleResult>(`${this.base}/courses/${courseId}/sessions/schedule`, payload); }
  update(courseId: string, id: string, payload: SessionPayload) { return this.http.put<CourseSession>(`${this.base}/courses/${courseId}/sessions/${id}`, payload); }
  teachingCourses() { return this.http.get<SessionCourse[]>(`${this.base}/teaching/courses`); }
}
