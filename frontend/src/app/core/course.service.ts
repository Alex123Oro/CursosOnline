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
export interface ParticipantTypeOption { id: string; name: string; }

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
  createdAt: string;
  updatedAt: string;
  capacity?: number | null;
  remainingSlots: number | null;
  occupiedSlots: number;
  preinscriptionStart: string | null;
  preinscriptionEnd: string | null;
  prices: CoursePrice[];
  enrollment: {
    status: EnrollmentStatus;
    scholarshipPercent: number;
    benefitAmount: number;
    finalAmount: number;
    confirmedAt?: string | null;
  } | null;
}

export interface CoursePayload {
  code?: string;
  name: string;
  content: string;
  durationHours: number;
  instructor: string;
  schedule: string;
  approvalCriteria: string;
  status?: CourseStatus;
  startDate?: string | null;
  endDate?: string | null;
  prices?: { participantTypeId: string; basePrice: number }[];
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

  preenroll(id: string): Observable<unknown> {
    return this.http.post(`${environment.apiBaseUrl}/enrollments/${id}/preenroll`, {});
  }

  create(payload: CoursePayload): Observable<Course> {
    const { prices: _prices, ...course } = payload;
    return this.http.post<Course>(this.apiUrl, course);
  }

  update(id: string, payload: CoursePayload): Observable<Course> {
    const { prices: _prices, ...course } = payload;
    return this.http.put<Course>(`${this.apiUrl}/${id}`, course);
  }

  publish(id: string): Observable<Course> {
    return this.http.patch<Course>(`${this.apiUrl}/${id}/publish`, {});
  }

  participantTypes(): Observable<ParticipantTypeOption[]> {
    return this.http.get<ParticipantTypeOption[]>(`${environment.apiBaseUrl}/participant-types`);
  }

  replacePrices(id: string, items: { participantTypeId: string; basePrice: number }[]): Observable<Course> {
    return this.http.put<Course>(`${this.apiUrl}/${id}/prices`, { items });
  }
}
