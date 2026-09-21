import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface Course {
  id: string;
  code: string;
  name: string;
  content: string;
  durationHours: number;
  instructor: string;
  schedule: string;
  approvalCriteria: string;
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
  approvalCriteria: string;
}

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly apiUrl = 'http://localhost:3333/api/courses';

  constructor(private readonly http: HttpClient) {}

  list(): Observable<Course[]> {
    return this.http.get<Course[]>(this.apiUrl);
  }

  create(payload: CoursePayload): Observable<Course> {
    return this.http.post<Course>(this.apiUrl, payload);
  }

  update(id: string, payload: CoursePayload): Observable<Course> {
    return this.http.put<Course>(`${this.apiUrl}/${id}`, payload);
  }
}
