import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { PUBLIC_REQUEST } from './public-request';

export interface Certificate {
  id: string; code: string; participantName: string; courseName: string; durationHours: number;
  type: 'aprobacion' | 'participacion'; issuedAt: string; status: 'VALID' | 'REVOKED'; publicUrl: string;
}
export type PublicCertificate = {
  status: 'VALID'; message: string; code: string; participantName: string;
  courseName: string; durationHours: number; type: Certificate['type']; issuedAt: string;
} | { status: 'REVOKED'; message: string; code: string };
export interface CertificateCourse { id: string; name: string; code: string; }
export interface CertificateCandidate {
  enrollmentId: string; name: string; approvalStatus: 'APROBADO' | 'REPROBADO' | 'PENDIENTE';
  blockedReason: string | null; certificate: { id: string; code: string; status: Certificate['status'] } | null;
}
export interface CertificateRoster { course: CertificateCourse; students: CertificateCandidate[]; }
export interface CertificateBatch { issued: Certificate[]; failed: { enrollmentId: string; message: string }[]; }

@Injectable({ providedIn: 'root' })
export class CertificateService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/certificates`;
  courses() { return this.http.get<CertificateCourse[]>(`${this.base}/courses`); }
  roster(courseId: string, type: Certificate['type'] = 'aprobacion') { return this.http.get<CertificateRoster>(`${environment.apiBaseUrl}/courses/${courseId}/certificates`, type === 'aprobacion' ? {} : { params: { type } }); }
  issue(enrollmentId: string, type: Certificate['type'] = 'aprobacion', templateId?: string) { return this.http.post<Certificate>(this.base, { enrollmentId, type, ...(templateId ? { templateId } : {}) }); }
  bulk(courseId: string, enrollmentIds: string[], type: Certificate['type'] = 'aprobacion', templateId?: string) {
    return this.http.post<CertificateBatch>(`${environment.apiBaseUrl}/courses/${courseId}/certificates/bulk`, { ...(type === 'aprobacion' ? { enrollmentIds } : { enrollmentIds, type }), ...(templateId ? { templateId } : {}) });
  }
  verify(code: string) {
    return this.http.get<PublicCertificate>(`${this.base}/verify/${encodeURIComponent(code.trim().toUpperCase())}`, {
      context: new HttpContext().set(PUBLIC_REQUEST, true)
    });
  }
  mine() { return this.http.get<Certificate[]>(`${this.base}/me`); }
  detail(id: string) { return this.http.get<Certificate>(`${this.base}/me/${id}`); }
  download(id: string) { return this.http.get(`${this.base}/me/${id}/pdf`, { responseType: 'blob' }); }
}
