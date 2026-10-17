import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import forge from 'node-forge';
import { PDFDocument } from 'pdf-lib';

const env = vi.hoisted(() => ({ nodeEnv: 'test', pdfSigningPath: '', pdfSigningPassword: 'test-password', pdfSigningDemo: false }));
vi.mock('../src/config/env.js', () => ({ env }));
import { certificatePdfService } from '../src/modules/certificates/certificate-pdf.service.js';
import type { Certificate } from '../src/modules/certificates/certificate.types.js';

const certificate: Certificate = { id: '1', code: '0FA075C6', participantName: 'Luis Estudiante',
  courseName: 'Curso de ejemplo - DEMOSTRACION SIN VALIDEZ ACADEMICA', durationHours: 4,
  type: 'aprobacion', issuedAt: '2026-10-16T07:57:42Z', status: 'VALID', publicUrl: 'http://localhost:4200/verificar/0FA075C6' };
let directory: string;

// Independently verify both the CMS signature over signed attributes and its
// digest over the actual PDF ByteRange using Node/OpenSSL crypto.
function validSignature(pdf: Buffer) {
  const range = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(pdf.toString('latin1'));
  if (!range) return false;
  const [start, length, second, tail] = range.slice(1).map(Number) as [number, number, number, number];
  if (start !== 0 || second + tail !== pdf.length) return false;
  const signedBytes = Buffer.concat([pdf.subarray(0, length), pdf.subarray(second, second + tail)]);
  const der = Buffer.from(pdf.subarray(length + 1, second - 1).toString('ascii'), 'hex');
  const cms = forge.asn1.fromDer(der.toString('binary'), { strict: false, parseAllBytes: false });
  const children = (node: forge.asn1.Asn1) => node.value as forge.asn1.Asn1[];
  const signedData = children(children(cms)[1]!)[0]!;
  const signerInfos = children(signedData).at(-1)!;
  const info = children(children(signerInfos)[0]!);
  const attrs = children(info[3]!);
  const digestAttr = attrs.find(attr => forge.asn1.derToOid(children(attr)[0]!.value as string) === forge.pki.oids.messageDigest)!;
  const expectedDigest = children(children(digestAttr)[1]!)[0]!.value as string;
  if (createHash('sha256').update(signedBytes).digest('binary') !== expectedDigest) return false;
  const attributes = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs);
  const message = forge.pkcs7.messageFromAsn1(cms) as forge.pkcs7.PkcsSignedData;
  const publicKey = forge.pki.publicKeyToPem(message.certificates[0]!.publicKey);
  return verify('RSA-SHA256', Buffer.from(forge.asn1.toDer(attributes).getBytes(), 'binary'), publicKey,
    Buffer.from(info[5]!.value as string, 'binary'));
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'eva-pdf-signature-'));
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const cert = forge.pki.createCertificate();
  const key = forge.pki.privateKeyFromPem(pair.privateKey);
  cert.publicKey = forge.pki.publicKeyFromPem(pair.publicKey);
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60000);
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  const attrs = [{ name: 'commonName', value: 'Test signing fixture' }];
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.sign(key, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(key, cert, env.pdfSigningPassword, { algorithm: 'aes256' });
  env.pdfSigningPath = join(directory, 'test.p12');
  await writeFile(env.pdfSigningPath, Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'));
});
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

describe('PDF cryptographic signature', () => {
  it('embeds a verifiable signature and detects changed PDF content', async () => {
    const pdf = await certificatePdfService.generate(certificate);
    expect(validSignature(pdf)).toBe(true);
    const loaded = await PDFDocument.load(pdf);
    expect(loaded.getPageCount()).toBe(1);
    const changed = Buffer.from(pdf);
    changed[10] = changed[10]! ^ 1;
    expect(validSignature(changed)).toBe(false);
    const damagedSignature = Buffer.from(pdf);
    const offset = /\/Contents\s*</.exec(pdf.toString('latin1'))!;
    const firstHex = offset.index + offset[0].length;
    const paddedDer = Buffer.from(pdf.toString('latin1').slice(firstHex).split('>')[0]!, 'hex');
    const cms = forge.asn1.fromDer(paddedDer.toString('binary'), { strict: false, parseAllBytes: false });
    // With no unsigned attributes, the last DER octet belongs to the RSA
    // signature, rather than a certificate label or the unused PDF padding.
    const lastSignatureHex = firstHex + forge.asn1.toDer(cms).length() * 2 - 1;
    damagedSignature[lastSignatureHex] = damagedSignature[lastSignatureHex] === 48 ? 49 : 48;
    let accepted = false;
    try { accepted = validSignature(damagedSignature); } catch { /* Malformed CMS is rejected. */ }
    expect(accepted).toBe(false);
  });
  it.each(['test', 'production'])('rejects demo signing configuration in %s', async mode => {
    env.nodeEnv = mode; env.pdfSigningDemo = true;
    try { await expect(certificatePdfService.generate(certificate)).rejects.toMatchObject({ statusCode: 503 }); }
    finally { env.nodeEnv = 'test'; env.pdfSigningDemo = false; }
  });
  it('fails clearly instead of silently returning unsigned PDF for a bad signing key', async () => {
    const password = env.pdfSigningPassword;
    env.pdfSigningPassword = 'wrong';
    try { await expect(certificatePdfService.generate(certificate)).rejects.toMatchObject({ statusCode: 503 }); }
    finally { env.pdfSigningPassword = password; }
  });
});
