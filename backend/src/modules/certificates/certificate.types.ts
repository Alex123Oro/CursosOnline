export type CertificateRole = 'ADMIN' | 'INSTRUCTOR' | 'PARTICIPANT';
import type { CertificateTemplateConfig } from './certificate-template.rules.js';
export interface CertificateTemplateSnapshot { id: string; name: string; version: number; config: CertificateTemplateConfig; }
export interface CertificateUser { id: string; role: CertificateRole; }
export interface CertificateSnapshot {
  participantName: string;
  courseName: string;
  durationHours: number;
  version: 1;
  demo?: boolean;
  template?: CertificateTemplateSnapshot;
}
export interface Certificate {
  id: string;
  code: string;
  participantName: string;
  courseName: string;
  durationHours: number;
  type: 'aprobacion' | 'participacion';
  issuedAt: string;
  status: 'VALID' | 'REVOKED';
  publicUrl: string;
  demo?: boolean;
  template?: CertificateTemplateSnapshot;
}
export interface CertificateCandidate {
  enrollmentId: string;
  name: string;
  approvalStatus: 'APROBADO' | 'REPROBADO' | 'PENDIENTE';
  blockedReason: string | null;
  certificate: { id: string; code: string; status: 'VALID' | 'REVOKED' } | null;
}
export interface CertificateRoster {
  course: { id: string; name: string; code: string };
  students: CertificateCandidate[];
}
