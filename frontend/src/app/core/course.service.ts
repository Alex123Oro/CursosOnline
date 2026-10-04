import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type CourseStatus = 'DRAFT' | 'PUBLISHED';
export type EnrollmentStatus = 'PREINSCRITO' | 'INSCRITO';

export interface CoursePrice {
  participantTypeId: string;
  participantTypeName: string;
  basePrice: number;
}

export interface CourseEnrollmentSummary {
  id: string;
  status: EnrollmentStatus;
  basePrice: number;
  scholarshipPercent: number;
  benefitAmount: number;
  finalAmount: number;
  paymentRegistered: boolean;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  content: string;
  durationHours: number;
  instructor: string;
  schedule: string;
  approvalCriteria: string;
  status: CourseStatus;
  startDate: string | null;
  endDate: string | null;
  capacity: number | null;
  preinscriptionStart: string | null;
  preinscriptionEnd: string | null;
  occupiedSlots: number;
  remainingSlots: number | null;
  prices: CoursePrice[];
  enrollment: CourseEnrollmentSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoursePayload {
  code?: string;
  name: string;
  content: string;
  durationHours: number;
  instructor: string;
  schedule: string;
  startDate?: string | null;
  endDate?: string | null;
  capacity?: number | null;
  preinscriptionStart?: string | null;
  preinscriptionEnd?: string | null;
}

export interface CoursePricesPayload {
  items: { participantTypeId: string; basePrice: number }[];
}

export interface ParticipantType {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly apiUrl = `${environment.apiBaseUrl}/courses`;

  constructor(private readonly http: HttpClient) {}

  list(): Observable<Course[]> {
    return this.http.get<Course[]>(this.apiUrl);
  }

  catalog(): Observable<Course[]> {
    return this.http.get<Course[]>(`${this.apiUrl}/catalog`);
  }

  catalogById(id: string): Observable<Course> {
    return this.http.get<Course>(`${this.apiUrl}/catalog/${id}`);
  }

  create(payload: CoursePayload): Observable<Course> {
    return this.http.post<Course>(this.apiUrl, payload);
  }

  update(id: string, payload: CoursePayload): Observable<Course> {
    return this.http.put<Course>(`${this.apiUrl}/${id}`, payload);
  }

  publish(id: string): Observable<Course> {
    return this.http.patch<Course>(`${this.apiUrl}/${id}/publish`, {});
  }

  replacePrices(id: string, payload: CoursePricesPayload): Observable<Course> {
    return this.http.put<Course>(`${this.apiUrl}/${id}/prices`, payload);
  }

  preenroll(id: string): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/${id}/preenroll`, {});
  }

  participantTypes(): Observable<ParticipantType[]> {
    return this.http.get<ParticipantType[]>(`${environment.apiBaseUrl}/participant-types`);
  }
}
