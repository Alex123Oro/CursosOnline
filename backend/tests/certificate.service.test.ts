import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ issue: vi.fn(), verify: vi.fn(), mine: vi.fn(), owned: vi.fn(), roster: vi.fn(), courses: vi.fn(), randomBytes: vi.fn() }));
vi.mock('node:crypto', () => ({ randomBytes: mocks.randomBytes }));
vi.mock('../src/config/env.js', () => ({ env: { publicAppUrl: 'https://certificates.example.test', nodeEnv: 'test' } }));
vi.mock('../src/modules/certificates/certificate.repository.js', () => ({
  certificateRepository: mocks, CertificateCodeCollision: class CertificateCodeCollision extends Error {}
}));
import { CertificateCodeCollision } from '../src/modules/certificates/certificate.repository.js';
import { certificateService } from '../src/modules/certificates/certificate.service.js';
import { HttpError } from '../src/shared/http-error.js';

const row = {
  id: '7', codigo_verificacion: '8F72A91C', tipo: 'aprobacion', fecha_emision: '2026-10-01T12:00:00Z', estado: 'valido',
  datos_emision: { participantName: 'Ana Álvarez', courseName: 'PostgreSQL', durationHours: 40, version: 1 },
  anulaciones_certificados: [], correo: 'private@example.test', documento_identidad: 'private-document', resultado_curso_id: 42
};
describe('certificate service', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.randomBytes.mockReturnValue(Buffer.from('8f72a91c','hex')); mocks.issue.mockResolvedValue(row); });
  it('issues with crypto, persists the environment URL and returns the private DTO', async () => {
    expect(await certificateService.issue('12','1')).toMatchObject({ id: '7', code: '8F72A91C', publicUrl: 'https://certificates.example.test/verificar/8F72A91C' });
    expect(mocks.randomBytes).toHaveBeenCalledWith(4);
    expect(mocks.issue).toHaveBeenCalledWith('12','8F72A91C','https://certificates.example.test/verificar/8F72A91C','1','aprobacion');
  });
  it('retries only a code collision and uses the new code', async () => {
    mocks.issue.mockRejectedValueOnce(new CertificateCodeCollision());
    mocks.randomBytes.mockReturnValueOnce(Buffer.from('11111111','hex')).mockReturnValueOnce(Buffer.from('8f72a91c','hex'));
    await certificateService.issue('12','1');
    expect(mocks.issue).toHaveBeenCalledTimes(2); expect(mocks.issue.mock.calls[1]?.[1]).toBe('8F72A91C');
  });
  it('preserves the selected participation type for single and bulk issuance', async () => {
    mocks.issue.mockResolvedValue({ ...row, tipo: 'participacion' });
    mocks.roster.mockResolvedValue({ students: [{ enrollmentId: '12' }] });
    expect((await certificateService.issue('12','1','participacion')).type).toBe('participacion');
    await certificateService.bulk('2',['12'],'1','participacion');
    expect(mocks.roster).toHaveBeenCalledWith('2','participacion');
    expect(mocks.issue).toHaveBeenLastCalledWith('12','8F72A91C','https://certificates.example.test/verificar/8F72A91C','1','participacion');
  });
  it('stops after five collisions', async () => {
    mocks.issue.mockRejectedValue(new CertificateCodeCollision());
    await expect(certificateService.issue('12','1')).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.issue).toHaveBeenCalledTimes(5);
  });
  it.each([400,409])('does not retry a failed approval or duplicate emission (%s)', async statusCode => {
    mocks.issue.mockRejectedValue(new HttpError(statusCode,'Rejected'));
    await expect(certificateService.issue('12','1')).rejects.toMatchObject({ statusCode });
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });
  it('returns an allowlisted public response with no email, document or internal IDs', async () => {
    mocks.verify.mockResolvedValue(row);
    const result = await certificateService.verify('8F72A91C');
    expect(Object.keys(result).sort()).toEqual(['status','message','code','participantName','courseName','durationHours','type','issuedAt'].sort());
    expect(result.message).toBe('Certificado válido');
    expect(JSON.stringify(result)).not.toMatch(/private|resultado|"id"/);
  });
  it('reports an unknown certificate', async () => {
    mocks.verify.mockResolvedValue(null);
    await expect(certificateService.verify('11111111')).rejects.toMatchObject({ statusCode: 404, message: 'Certificado no válido o inexistente' });
  });
  it('accepts a null one-to-one cancellation relation from PostgREST', async () => {
    mocks.owned.mockResolvedValue({ ...row, anulaciones_certificados: null });
    await expect(certificateService.downloadable('7','9')).resolves.toMatchObject({ status: 'VALID' });
  });
  it('blocks downloads when PostgREST returns a single cancellation object', async () => {
    mocks.owned.mockResolvedValue({ ...row, anulaciones_certificados: { id: 1 } });
    await expect(certificateService.downloadable('7','9')).rejects.toMatchObject({ statusCode: 409 });
  });
  it.each([{ ...row, estado: 'anulado' }, { ...row, anulaciones_certificados: [{ id: 1 }] }])('honors either source of cancellation', async record => {
    mocks.verify.mockResolvedValue(record);
    expect(await certificateService.verify('8F72A91C')).toEqual({ status: 'REVOKED', message: 'Certificado anulado', code: '8F72A91C' });
  });
  it('returns an empty owned list', async () => { mocks.mine.mockResolvedValue([]); expect(await certificateService.mine('9')).toEqual([]); expect(mocks.mine).toHaveBeenCalledWith('9'); });
  it('uses the authenticated owner and treats an unowned record as 404', async () => {
    mocks.owned.mockResolvedValue(null);
    await expect(certificateService.owned('7','9')).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.owned).toHaveBeenCalledWith('7','9');
  });
  it('blocks revoked downloads', async () => {
    mocks.owned.mockResolvedValue({ ...row, anulaciones_certificados: [{ id: 1 }] });
    await expect(certificateService.downloadable('7','9')).rejects.toMatchObject({ statusCode: 409 });
  });
  it('keeps independent bulk outcomes and rejects enrollments from a different course', async () => {
    mocks.roster.mockResolvedValue({ students: [{ enrollmentId: '12' }, { enrollmentId: '13' }] });
    mocks.issue.mockRejectedValueOnce(new HttpError(409,'Ya emitido')).mockResolvedValueOnce(row);
    const result = await certificateService.bulk('2',['12','13'],'1');
    expect(result.issued).toHaveLength(1); expect(result.failed).toEqual([{ enrollmentId: '12', message: 'Ya emitido' }]);
    await expect(certificateService.bulk('2',['99'],'1')).rejects.toMatchObject({ statusCode: 400 });
  });
});
