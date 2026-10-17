import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Uso: node scripts/verify-certificate-pdf.mjs archivo.pdf');
const pdf = await readFile(source);
const range = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(pdf.toString('latin1'));
if (!range) throw new Error('El PDF no contiene firma.');
const [start, length, second, tail] = range.slice(1).map(Number);
if (start !== 0 || second + tail !== pdf.length) throw new Error('La firma no cubre todo el documento.');
const content = Buffer.concat([pdf.subarray(0, length), pdf.subarray(second, second + tail)]);
const cms = Buffer.from(pdf.subarray(length + 1, second - 1).toString('ascii'), 'hex');
const directory = await mkdtemp(join(tmpdir(), 'eva-verify-pdf-'));
try {
  const signaturePath = join(directory, 'signature.der');
  const contentPath = join(directory, 'content.bin');
  const verifiedPath = join(directory, 'verified.bin');
  await writeFile(signaturePath, cms);
  await writeFile(contentPath, content);
  const gitOpenSsl = 'C:/Program Files/Git/usr/bin/openssl.exe';
  const openssl = process.env.OPENSSL_PATH ?? (existsSync(gitOpenSsl) ? gitOpenSsl : 'openssl');
  const args = ['cms', '-verify', '-binary', '-inform', 'DER', '-in', signaturePath,
    '-content', contentPath, '-noverify', '-out', verifiedPath];
  execFileSync(openssl, args, { stdio: 'pipe', windowsHide: true });
  if (!(await readFile(verifiedPath)).equals(content)) throw new Error('El contenido verificado no coincide.');
  content[0] ^= 1;
  await writeFile(contentPath, content);
  let rejected = false;
  try { execFileSync(openssl, args, { stdio: 'pipe', windowsHide: true }); } catch { rejected = true; }
  if (!rejected) throw new Error('La verificacion acepto contenido alterado.');
  console.log('OpenSSL: firma CMS y contenido PDF correctos; alteraciones rechazadas.');
  console.log('Esta prueba verifica integridad criptografica; no acredita confianza en el emisor.');
} finally { await rm(directory, { recursive: true, force: true }); }
