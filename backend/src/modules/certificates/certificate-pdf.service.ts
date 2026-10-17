import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import type { Certificate } from './certificate.types.js';
import { isDemoCertificate, prepareCertificateSignature } from './certificate-signature.js';
import { generateTemplateCertificate } from './certificate-template-pdf.js';

export const certificatePdfService = {
  async generate(certificate: Certificate): Promise<Buffer> {
    if (certificate.template) return generateTemplateCertificate(certificate);
    const signature = await prepareCertificateSignature(certificate);
    const demo = isDemoCertificate(certificate);
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Certificado ${certificate.code}`);
    pdf.setAuthor('EVA');
    pdf.setSubject(demo ? 'Demostración sin validez académica' : 'Certificado de formación continua');
    const page = pdf.addPage([842, 595]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const serif = await pdf.embedFont(StandardFonts.TimesRoman);
    const teal = rgb(0.025, 0.27, 0.26);
    const gold = rgb(0.66, 0.52, 0.30);
    const muted = rgb(0.36, 0.41, 0.40);
    const line = (x1: number, y1: number, x2: number, y2: number) =>
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color: gold, thickness: 0.7 });
    const label = (value: string, x: number, y: number, size = 9, color = muted) =>
      page.drawText(value, { x, y, size, font, color });
    const centered = (value: string, y: number, size: number, face = font, color = teal) =>
      page.drawText(value, { x: (842 - face.widthOfTextAtSize(value, size)) / 2, y, size, font: face, color });
    // Fit the complete name/title into bounded areas above the footer.
    const fitted = (value: string, top: number, maxSize: number, maxLines: number, height: number, face = bold) => {
      const clean = value.replace(/[\r\n\t]/g, ' ');
      let size = maxSize;
      let lines: string[] = [];
      while (size > 0.5) {
        lines = [];
        let current = '';
        for (const character of clean) {
          if (face.widthOfTextAtSize(current + character, size) > 650) { lines.push(current.trim()); current = ''; }
          current += character;
        }
        if (current) lines.push(current.trim());
        if (lines.length <= maxLines && lines.length * (size + 4) <= height) break;
        size -= 0.5;
      }
      lines.forEach((part, index) => centered(part, top - index * (size + 4), size, face));
    };
    page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(0.985, 0.978, 0.955) });
    page.drawRectangle({ x: 0, y: 0, width: 18, height: 595, color: teal });
    page.drawRectangle({ x: 18, y: 0, width: 5, height: 595, color: gold });
    page.drawRectangle({ x: 37, y: 25, width: 780, height: 545, borderColor: gold, borderWidth: 0.8 });
    page.drawRectangle({ x: 44, y: 32, width: 766, height: 531, borderColor: gold, borderWidth: 0.25 });
    label('EVA', 65, 510, 32, teal);
    line(145, 508, 145, 538);
    label('FORMACIÓN CONTINUA', 160, 526, 11, teal);
    label('Laboratorio de Informática', 160, 509, 10);
    label('ACREDITACIÓN ACADÉMICA', 616, 526, 9, teal);
    label(`N.º ${certificate.code}`, 616, 509, 11, gold);
    if (demo) centered('EJEMPLO · SIN VALIDEZ ACADÉMICA', 548, 8, bold, gold);
    line(65, 485, 788, 485);
    centered('CERTIFICADO', 432, 44, serif);
    centered(certificate.type === 'aprobacion' ? 'D E   A P R O B A C I Ó N' : 'D E   P A R T I C I P A C I Ó N', 405, 12, font, gold);
    centered('Se otorga el presente certificado a', 373, 11, font, muted);
    fitted(certificate.participantName, 339, 29, 2, 60, serif);
    centered(certificate.type === 'aprobacion' ? 'por haber aprobado satisfactoriamente el curso' : 'por su participación en el curso', 278, 11, font, muted);
    fitted(certificate.courseName, 250, 19, 2, 48);
    centered(`FORMACIÓN ACREDITADA  /  ${certificate.durationHours} HORAS ACADÉMICAS`, 192, 10, font, gold);
    line(65, 176, 788, 176);
    const date = new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeZone: 'America/La_Paz' })
      .format(new Date(certificate.issuedAt));
    label('FECHA DE EMISIÓN', 66, 150, 8, gold);
    label(date, 66, 132, 11, teal);
    label('CÓDIGO DE VERIFICACIÓN', 66, 106, 8, gold);
    page.drawText(certificate.code, { x: 66, y: 87, size: 15, font: bold, color: teal });
    page.drawRectangle({ x: 318, y: 80, width: 290, height: 78, color: rgb(1, 1, 1), borderColor: gold, borderWidth: 0.5 });
    label(signature ? 'FIRMADO DIGITALMENTE' : 'FIRMA DIGITAL PENDIENTE', 333, 141, 9, teal);
    label(signature ? signature.name.slice(0, 42) : 'Autoridad institucional', 333, 122, 10, teal);
    label(signature ? 'Certificado digital PKCS#12' : 'Requiere certificado digital institucional', 333, 105, 8);
    label(signature ? 'Integridad verificable en un lector PDF' : 'Documento sin firma criptográfica', 333, 91, 8);
    const qr = await pdf.embedPng(await QRCode.toBuffer(certificate.publicUrl, {
      type: 'png', errorCorrectionLevel: 'M', margin: 4, width: 400, color: { dark: '#064542', light: '#ffffff' }
    }));
    page.drawImage(qr, { x: 666, y: 65, width: 104, height: 104 });
    label('ESCANEA PARA VERIFICAR', 654, 52, 8, teal);
    label(demo ? 'Documento de demostración. No acredita formación real.' : 'EVA · Documento electrónico de formación continua.', 66, 52, 8);
    return signature ? signature.sign(pdf) : Buffer.from(await pdf.save());
  }
};
