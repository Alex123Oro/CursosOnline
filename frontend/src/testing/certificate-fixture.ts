import type { Certificate, CertificateCandidate } from '../app/core/certificate.service';
import type { SessionUser } from '../app/core/session.service';
export const certificateFixture: Certificate = {
  id: '7', code: '8F72A91C', participantName: 'Ana Álvarez', courseName: 'PostgreSQL', durationHours: 40,
  type: 'aprobacion', issuedAt: '2026-10-01T12:00:00Z', status: 'VALID', publicUrl: 'https://example.test/verificar/8F72A91C'
};
export const participantFixture: SessionUser = { id: '9', name: 'Ana', email: 'ana@example.test', role: 'PARTICIPANT', participantTypeId: null, participantTypeName: null };
export const approvedCandidate: CertificateCandidate = { enrollmentId: '12', name: 'Ana Álvarez', approvalStatus: 'APROBADO', blockedReason: null, certificate: null };
