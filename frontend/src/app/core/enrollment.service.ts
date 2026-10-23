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
  closedAt?: string | null;
  closureReason?: string | null;
  paymentMovements?: { id: string; kind: string; amount: number; reason: string; reference: string | null; recordedBy: string; registeredAt: string }[];
  history?: { id: string; status: EnrollmentStatus; reason: string; recordedBy: string; createdAt: string }[];
}
export interface EnrollmentCourseSummary {
  id: string; name: string; code: string; status: 'DRAFT' | 'PUBLISHED'; capacity: number | null;
  preenrolledCount: number; enrolledCount: number;
  closedCounts?: Partial<Record<EnrollmentStatus, number>>;
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
  mine() { return this.http.get<Enrollment[]>(`${this.apiUrl}/mine`); }
  cancelReservation(id: string, reason: string) { return this.http.post<Enrollment>(`${this.apiUrl}/${id}/cancel`, { reason }); }
  reject(id: string, reason: string) { return this.http.post<Enrollment>(`${this.apiUrl}/${id}/reject`, { reason }); }
  expire() { return this.http.post<{ expired: number }>(`${this.apiUrl}/expire`, {}); }
  movement(id: string, input: { kind: 'ABONO' | 'DEVOLUCION' | 'AJUSTE'; amount: number; reason: string; reference: string; requestId: string }) {
    return this.http.post<Enrollment>(`${this.apiUrl}/${id}/payment-movements`, input);
  }
  detail(id: string) { return this.http.get<Enrollment>(`${this.apiUrl}/${id}`); }
  listPage(query: EnrollmentQuery) {
    return this.http.get<EnrollmentPage>(this.apiUrl, { params: { ...query } });
  }

  assignScholarship(id: string, scholarshipPercent: number, reason: string): Observable<Enrollment> {
    return this.http.patch<Enrollment>(`${this.apiUrl}/${id}/scholarship`, { scholarshipPercent, reason });
  }

  deactivateScholarship(id: string): Observable<Enrollment> { return this.http.delete<Enrollment>(`${this.apiUrl}/${id}/scholarship`); }

  registerPayment(id: string, amount?: number, requestId = crypto.randomUUID(), reason = 'Abono registrado por administración', reference = ''): Observable<Enrollment> {
    return this.http.post<Enrollment>(`${this.apiUrl}/${id}/payments`, { ...(amount === undefined ? {} : { amount }), requestId, reason, reference });
  }

  confirm(id: string): Observable<Enrollment> {
    return this.http.post<Enrollment>(`${this.apiUrl}/${id}/confirm`, {});
  }
}
