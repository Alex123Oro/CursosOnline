import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { EnrollmentStatus } from './course.service';

export interface Enrollment {
  id: string;
  status: EnrollmentStatus;
  participantId: string;
  participantName: string;
  participantEmail: string;
  courseId: string;
  courseName: string;
  courseCode: string;
  participantTypeId: string;
  participantTypeName: string;
  basePrice: number;
  scholarshipPercent: number;
  scholarshipReason: string | null;
  scholarshipActive: boolean;
  benefitAmount: number;
  finalAmount: number;
  paymentRegistered: boolean;
  paymentAmount: number | null;
  paymentRegisteredAt: string | null;
  paymentStatus: 'NO_REQUIERE' | 'PENDIENTE' | 'PARCIAL' | 'PAGADO';
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
}
export interface EnrollmentCourseSummary {
  id: string; name: string; code: string; status: 'DRAFT' | 'PUBLISHED'; capacity: number | null;
  preenrolledCount: number; enrolledCount: number;
}
export interface EnrollmentQuery { courseId: string; status: EnrollmentStatus; search: string; page: number; }
export interface EnrollmentPage { items: Enrollment[]; total: number; page: number; pageSize: number; totalPages: number; }

@Injectable({ providedIn: 'root' })
export class EnrollmentService {
  private readonly apiUrl = `${environment.apiBaseUrl}/enrollments`;

  constructor(private readonly http: HttpClient) {}

  list(): Observable<Enrollment[]> {
    return this.http.get<Enrollment[]>(this.apiUrl);
  }
  courses() { return this.http.get<EnrollmentCourseSummary[]>(`${this.apiUrl}/courses`); }
  detail(id: string) { return this.http.get<Enrollment>(`${this.apiUrl}/${id}`); }
  listPage(query: EnrollmentQuery) {
    return this.http.get<EnrollmentPage>(this.apiUrl, { params: { ...query } });
  }

  assignScholarship(id: string, scholarshipPercent: number, reason: string): Observable<Enrollment> {
    return this.http.patch<Enrollment>(`${this.apiUrl}/${id}/scholarship`, { scholarshipPercent, reason });
  }

  deactivateScholarship(id: string): Observable<Enrollment> { return this.http.delete<Enrollment>(`${this.apiUrl}/${id}/scholarship`); }

  registerPayment(id: string, amount?: number): Observable<Enrollment> {
    return this.http.post<Enrollment>(`${this.apiUrl}/${id}/payments`, amount === undefined ? {} : { amount });
  }

  confirm(id: string): Observable<Enrollment> {
    return this.http.post<Enrollment>(`${this.apiUrl}/${id}/confirm`, {});
  }
}
