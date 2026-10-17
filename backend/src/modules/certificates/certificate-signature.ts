import { readFile } from 'node:fs/promises';
import forge from 'node-forge';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { P12Signer } from '@signpdf/signer-p12';
import { SignPdf } from '@signpdf/signpdf';
import type { PDFDocument } from 'pdf-lib';
import { env } from '../../config/env.js';
import { HttpError } from '../../shared/http-error.js';
import type { Certificate } from './certificate.types.js';

export const isDemoCertificate = (certificate: Certificate) =>
  certificate.demo === true || certificate.courseName.includes('DEMOSTRACION SIN VALIDEZ ACADEMICA');

export async function prepareCertificateSignature(certificate: Certificate) {
  if (!env.pdfSigningPath) return null;
  if (env.pdfSigningDemo) throw new HttpError(503, 'La firma de demostracion esta deshabilitada. Configure un certificado institucional.');
  try {
    const bytes = await readFile(env.pdfSigningPath);
    const password = env.pdfSigningPassword ?? '';
    const bundle = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytes.toString('binary')), password);
    const oid = forge.pki.oids.certBag!;
    const certificates = bundle.getBags({ bagType: oid })[oid] ?? [];
    const signingCertificate = certificates.map(bag => bag.cert).find(cert =>
      cert && !(cert.getExtension('basicConstraints') as { cA?: boolean } | undefined)?.cA);
    if (!signingCertificate || new Date() < signingCertificate.validity.notBefore || new Date() > signingCertificate.validity.notAfter) {
      throw new Error('Invalid or expired signing certificate');
    }
    const name = String(signingCertificate.subject.getField('CN')?.value ?? 'EVA');
    if (/EVA - FIRMA DE PRUEBA/i.test(name)) throw new Error('Demo signing identity is disabled');
    const signer = new P12Signer(bytes, { passphrase: password });
    const signingTime = new Date();
    return {
      name,
      async sign(pdf: PDFDocument) {
        pdflibAddPlaceholder({ pdfDoc: pdf, name, location: 'EVA', contactInfo: '',
          reason: `Emision de certificado ${certificate.code}`,
          signingTime, signatureLength: 16384, widgetRect: [0, 0, 0, 0] });
        return new SignPdf().sign(Buffer.from(await pdf.save({ useObjectStreams: false })), signer, signingTime);
      }
    };
  } catch {
    throw new HttpError(503, 'No se pudo cargar el certificado de firma digital. Contacta con administracion.');
  }
}
