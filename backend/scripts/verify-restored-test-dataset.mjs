import 'dotenv/config';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { PrismaClient,Prisma } from '@prisma/client';

const local = new URL('../.local/',import.meta.url);
const manifest = JSON.parse(await readFile(new URL('restored-test-dataset.json',local),'utf8'));
const credentials = JSON.parse(await readFile(new URL('restored-test-credentials.json',local),'utf8'));
const url = new URL(process.env.DATABASE_URL); url.searchParams.set('connect_timeout','15'); url.searchParams.set('pool_timeout','30'); url.searchParams.set('connection_limit','1');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const base = `http://localhost:${process.env.PUERTO ?? 3000}/api`;
const check = (value,message) => { if (!value) throw new Error(message); };
const request = async (route,options={}) => {
  const response = await fetch(`${base}/${route}`,{ ...options,signal: AbortSignal.timeout(30000) });
  check(response.ok,`API ${route} failed: ${response.status}`); return response;
};
try {
  const [totals] = await db.$queryRaw`SELECT (SELECT count(*)::integer FROM public.usuarios) AS users,(SELECT count(*)::integer FROM public.cursos) AS courses,(SELECT count(*)::integer FROM public.inscripciones) AS enrollments,(SELECT count(*)::integer FROM public.certificados) AS certificates`;
  const restored = await db.$queryRaw`SELECT id::text AS id,correo,rol::text AS role FROM public.usuarios WHERE id IN (${Prisma.join(manifest.restoredProfiles.map(user=>BigInt(user.id)))})`;
  check(restored.length===7,'Not all seven profiles were restored.');
  for (const user of manifest.restoredProfiles) check(restored.some(row=>row.id===user.id && row.correo===user.email && row.role===user.role),'Restored profile mismatch.');
  const certificates = await db.$queryRaw`SELECT c.id::text AS id,c.tipo::text AS type,r.nota_final,r.cumple_asistencia FROM public.certificados c JOIN public.resultados_curso r ON r.id=c.resultado_curso_id WHERE c.id IN (${Prisma.join(manifest.items.map(item=>BigInt(item.certificateId)))})`;
  check(certificates.length===10 && certificates.filter(row=>row.type==='aprobacion').length===5 && certificates.filter(row=>row.type==='participacion').length===5,'Unexpected certificate distribution.');
  check(certificates.every(row=>row.cumple_asistencia && (row.type==='participacion' ? row.nota_final===null : Number(row.nota_final)>=70)),'Invalid attendance or academic result.');
  for (const item of manifest.items) {
    const verified = await (await request(`certificates/verify/${item.certificateCode}`)).json();
    check(verified.status==='VALID' && verified.type===item.type && verified.courseName.includes('DEMOSTRACION SIN VALIDEZ ACADEMICA'),'Public certificate mismatch.');
  }
  const loginResults=[];
  const pdfs=[];
  for (const credential of credentials.users) {
    const session=await (await request('auth/login',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:credential.email,password:credential.password}) })).json();
    check(session.user.id===credential.profileId,'Unexpected signed-in profile.');
    const headers={Authorization:`Bearer ${session.accessToken}`};
    const me=await (await request('session/me',{headers})).json(); check(me.id===credential.profileId,'Session profile mismatch.');
    if(credential.role==='participante') {
      const mine=await (await request('certificates/me',{headers})).json();
      check(mine.length>=2 && mine.every(item=>item.participantName),'Participant certificates missing.');
      if(credential.email==='luis@eva.local') for(const type of ['aprobacion','participacion']) {
        const certificate=mine.find(item=>item.type===type); check(certificate,'Missing sample certificate.');
        const response=await request(`certificates/me/${certificate.id}/pdf`,{headers});
        const bytes=Buffer.from(await response.arrayBuffer()); const pdf=await PDFDocument.load(bytes);
        check(pdf.getPageCount()===1 && pdf.getSubject()?.includes('sin validez académica'),'PDF is not marked as a demonstration.');
        const path=new URL(`../../docs/output/certificado-prueba-${type}.pdf`,import.meta.url);
        await mkdir(new URL('.',path),{recursive:true}); await writeFile(path,bytes);
        pdfs.push({type,certificateCode:certificate.code,verificationUrl:certificate.publicUrl});
      }
    }
    loginResults.push({email:credential.email,role:me.role,verified:true});
    await request('auth/logout',{method:'POST',headers});
  }
  const report={verifiedAt:new Date().toISOString(),totals,restoredProfiles:restored.length,verifiedPublicCertificates:10,logins:loginResults,samplePdfs:pdfs};
  await writeFile(new URL('restored-test-verification.json',local),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}catch(error){console.error('Dataset verification failed:',error.code??error.message);process.exitCode=1;}
finally{await db.$disconnect();}
