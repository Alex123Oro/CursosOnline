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
  benefitAmount: number;
  finalAmount: number;
  paymentRegistered: boolean;
  paymentAmount: number | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class EnrollmentService {
  private readonly apiUrl = `${environment.apiBaseUrl}/enrollments`;

  constructor(private readonly http: HttpClient) {}

  list(): Observable<Enrollment[]> {
    return this.http.get<Enrollment[]>(this.apiUrl);
  }

  assignScholarship(id: string, scholarshipPercent: number): Observable<Enrollment> {
    return this.http.patch<Enrollment>(`${this.apiUrl}/${id}/scholarship`, { scholarshipPercent });
  }

  registerPayment(id: string, amount?: number): Observable<Enrollment> {
    return this.http.post<Enrollment>(`${this.apiUrl}/${id}/payments`, amount === undefined ? {} : { amount });
  }

  confirm(id: string): Observable<Enrollment> {
    return this.http.post<Enrollment>(`${this.apiUrl}/${id}/confirm`, {});
  }
}
