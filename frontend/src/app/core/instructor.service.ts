import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { SessionUser } from './session.service';

export type InstructorDegree = 'Estudiante' | 'Ingeniero' | 'Técnico';
export interface InstructorPayload {
  name: string; email: string; degree: InstructorDegree; sis: string; phone: string; password: string;
}
@Injectable({ providedIn: 'root' })
export class InstructorService {
  private readonly http = inject(HttpClient);
  create(payload: InstructorPayload) {
    return this.http.post<SessionUser>(`${environment.apiBaseUrl}/admin/instructors`, payload);
  }
}
