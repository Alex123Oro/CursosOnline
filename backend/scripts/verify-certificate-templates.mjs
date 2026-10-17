import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import assert from 'node:assert/strict';
const db=new PrismaClient();const local=new URL('../.local/',import.meta.url);
const credentials=(await Promise.all(['restored-test-credentials.json','full-workflow-credentials.json','roster-participant-credentials.json'].map(async name=>JSON.parse(await readFile(new URL(name,local),'utf8'))))).flatMap(m=>m.users);
const base=`http://localhost:${process.env.PUERTO??3000}/api`;const tokens=[];let requests=0;
async function api(path,{method='GET',token,body,expected=200}={}){
  const response=await fetch(`${base}/${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{ })},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  requests++;assert.equal(response.status,expected,`${method} ${path}: ${response.status}`);return response;
}
async function login(account){assert(account);const session=await(await api('auth/login',{method:'POST',body:{email:account.email,password:account.password}})).json();tokens.push(session.accessToken);return session.accessToken;}
const json=async(path,token)=> (await api(path,{token})).json();
try{
  const before=await db.$queryRaw`SELECT id::text AS id,to_jsonb(t) AS row FROM public.certificados t ORDER BY id`;
  const admin=await login(credentials.find(u=>u.email==='admin@eva.local'));
  await api('certificate-templates',{expected:401});
  const initial=await json('certificate-templates',admin);assert(initial.length>=2);
  const approval=initial.find(t=>t.type==='aprobacion');const participation=initial.find(t=>t.type==='participacion');assert(approval&&participation);
  const sample={name:'Vista previa institucional',type:'aprobacion',config:{...approval.config,logo:await QRCode.toDataURL('EVA'),signature:''}};
  const preview=await api('certificate-templates/preview',{method:'POST',token:admin,body:sample});
  const previewPdf=await PDFDocument.load(await preview.arrayBuffer());assert.equal(previewPdf.getAuthor(),sample.config.institution);assert.equal(previewPdf.getPageCount(),1);
  let template=initial.find(t=>t.name==='Aprobación moderna');
  if(!template)template=await(await api('certificate-templates',{method:'POST',token:admin,expected:201,body:{name:'Aprobación moderna',type:'aprobacion',config:{...approval.config,font:'sans',layout:'modern',accentColor:'#087F78',footer:'Validación mediante código y QR.'}}})).json();
  const snapshotConfig=structuredClone(template.config),snapshotVersion=template.version;
  const courses=await json('certificates/courses',admin);const course=courses.find(c=>c.code==='NET-2026');assert(course);
  const roster=await json(`courses/${course.id}/certificates`,admin);const candidate=roster.students.find(s=>s.approvalStatus==='APROBADO'&&!s.certificate&&!s.blockedReason);assert(candidate);
  await api('certificates',{method:'POST',token:admin,expected:400,body:{enrollmentId:candidate.enrollmentId,type:'aprobacion',templateId:participation.id}});
  const issued=await(await api('certificates',{method:'POST',token:admin,expected:201,body:{enrollmentId:candidate.enrollmentId,type:'aprobacion',templateId:template.id}})).json();
  assert.equal(issued.template.id,template.id);assert.equal(issued.template.version,snapshotVersion);
  await api('certificates',{method:'POST',token:admin,expected:409,body:{enrollmentId:candidate.enrollmentId,type:'aprobacion',templateId:template.id}});
  const updated=await(await api(`certificate-templates/${template.id}`,{method:'PUT',token:admin,body:{name:template.name,type:template.type,config:{...template.config,accentColor:'#A8854D',footer:'Documento de formación continua. Verifica su autenticidad con el código y QR.'},version:template.version}})).json();
  assert.equal(updated.version,snapshotVersion+1);
  await api(`certificate-templates/${template.id}`,{method:'PUT',token:admin,expected:409,body:{name:template.name,type:template.type,config:template.config,version:template.version}});
  const [enrollment]=await db.$queryRaw`SELECT u.correo AS email FROM public.inscripciones i JOIN public.usuarios u ON u.id=i.participante_id WHERE i.id=${BigInt(candidate.enrollmentId)}`;
  const owner=await login(credentials.find(u=>u.email===enrollment.email));
  await api('certificate-templates',{token:owner,expected:403});
  await api('certificate-templates/preview',{method:'POST',token:owner,expected:403,body:sample});
  const historical=await json(`certificates/me/${issued.id}`,owner);
  assert.equal(historical.template.version,snapshotVersion);assert.deepEqual(historical.template.config,snapshotConfig);
  const pdf=await PDFDocument.load(await(await api(`certificates/me/${issued.id}/pdf`,{token:owner})).arrayBuffer());assert.equal(pdf.getAuthor(),snapshotConfig.institution);
  const git=courses.find(c=>c.code==='GIT-2026');const gitRoster=await json(`courses/${git.id}/certificates?type=participacion`,admin);
  const candidates=gitRoster.students.filter(s=>s.approvalStatus==='APROBADO'&&!s.certificate&&!s.blockedReason).slice(0,2);assert.equal(candidates.length,2);
  const batch=await(await api(`courses/${git.id}/certificates/bulk`,{method:'POST',token:admin,body:{type:'participacion',templateId:participation.id,enrollmentIds:candidates.map(s=>s.enrollmentId)}})).json();
  assert.equal(batch.issued.length,2);assert(batch.issued.every(c=>c.template.id===participation.id));
  const after=await db.$queryRaw`SELECT id::text AS id,to_jsonb(t) AS row FROM public.certificados t ORDER BY id`;
  assert.deepEqual(after.filter(row=>before.some(old=>old.id===row.id)),before);
  const result={passed:true,requests,templateId:template.id,templateVersion:updated.version,preview:true,realPdf:true,snapshotImmutable:true,versionConflict:true,rolesEnforced:true,bulkWithTemplate:2,issuedWithTemplate:issued.code,previousCertificatesPreserved:before.length,totalCertificates:after.length};
  await writeFile(new URL('certificate-template-verification.json',local),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){console.error('Template verification failed:',error.message);process.exitCode=1;}
finally{await db.$disconnect();for(const token of tokens)try{await api('auth/logout',{method:'POST',token});}catch{}}
