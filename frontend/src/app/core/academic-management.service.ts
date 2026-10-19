import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface InstructorAssignment {
  id: number; courseId: number; instructorId: number; assignedAt: string;
  course: { id: number; name: string; code: string | null; status: string };
  instructor: { id: number; name: string; email: string };
}

@Injectable({ providedIn: 'root' })
export class AcademicManagementService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;
  assignments() { return this.http.get<InstructorAssignment[]>(`${this.base}/admin/instructor-assignments`); }
  assign(courseId: string, instructorId: string) {
    return this.http.post<InstructorAssignment>(`${this.base}/admin/instructor-assignments`, { courseId: Number(courseId), instructorId: Number(instructorId) });
  }
  change(id: number, instructorId: string) {
    return this.http.put<InstructorAssignment>(`${this.base}/admin/instructor-assignments/${id}`, { instructorId: Number(instructorId) });
  }
  remove(id: number) { return this.http.delete<{ deleted: boolean }>(`${this.base}/admin/instructor-assignments/${id}`); }
}
