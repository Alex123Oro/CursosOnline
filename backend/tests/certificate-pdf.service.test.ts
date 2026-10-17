import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import { certificatePdfService } from '../src/modules/certificates/certificate-pdf.service.js';

describe('certificate PDF', () => {
  it('creates a landscape PDF containing an embedded QR image and document title', async () => {
    const qr = vi.spyOn(QRCode, 'toBuffer');
    const bytes = await certificatePdfService.generate({ id: '7', code: '8F72A91C', participantName: 'Ana Álvarez', courseName: 'Programación básica', durationHours: 40,
      type: 'aprobacion', issuedAt: '2026-10-01T12:00:00Z', status: 'VALID', publicUrl: 'https://example.test/verificar/8F72A91C' });
    expect(bytes.subarray(0,4).toString()).toBe('%PDF');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe('Certificado 8F72A91C'); expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight());
    expect(pdf.getPage(0).node.Resources()?.toString()).toContain('Image');
    expect(qr).toHaveBeenCalledWith('https://example.test/verificar/8F72A91C', expect.objectContaining({
      margin: 4, width: 400, errorCorrectionLevel: 'M'
    }));
    qr.mockRestore();
  });
});
