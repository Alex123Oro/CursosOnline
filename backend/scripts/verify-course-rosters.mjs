import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
const local=new URL('../.local/',import.meta.url);
const result=JSON.parse(await readFile(new URL('roster-population-result.json',local),'utf8'));
const restored=JSON.parse(await readFile(new URL('restored-test-credentials.json',local),'utf8'));
const participants=JSON.parse(await readFile(new URL('roster-participant-credentials.json',local),'utf8'));
const base=`http://localhost:${process.env.PUERTO??3000}/api`;
const tokens=[];
const db=new PrismaClient();
async function login(account){
  const response=await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Login HTTP ${response.status}`);
  const session=await response.json();tokens.push(session.accessToken);return session.accessToken;
}
async function get(path,token){
  const response=await fetch(`${base}/${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${path}`);
  return response.json();
}
try{
  const admin=await login(restored.users.find(u=>u.email==='admin@eva.local'));
  const courses=await get('courses',admin);
  for(const expected of result.courses){
    const course=courses.find(c=>c.id===String(expected.id));
    if(!course||course.enrolledCount<20||(course.capacity!==null&&course.capacity<course.occupiedSlots))throw new Error(`Invalid roster/capacity: ${expected.id}`);
  }
  const learner=await login(participants.users[0]);
  const profile=await get('session/me',learner);
  if(profile.role!=='PARTICIPANT')throw new Error('New participant role mismatch.');
  const backupName=(await readdir(local)).filter(name=>/^roster-backup-\d+\.json$/.test(name)).sort().at(-1);
  const backup=JSON.parse(await readFile(new URL(backupName,local),'utf8'));
  const [totals]=await db.$queryRaw`SELECT count(*)::integer AS total,
    count(*) FILTER(WHERE estado::text='preinscrito')::integer AS pending,
    count(*) FILTER(WHERE estado::text='inscrito')::integer AS confirmed FROM public.inscripciones`;
  if(totals.pending!==backup.inscripciones.filter(item=>item.row.estado==='preinscrito').length||totals.total!==backup.inscripciones.length+result.added)throw new Error('Existing enrollment counts were altered.');
  console.log(JSON.stringify({verifiedCourses:result.courses.length,minimumConfirmed:Math.min(...result.courses.map(c=>c.confirmed)),newParticipantLogin:true,preEnrollmentsPreserved:true,...totals}));
}catch(error){console.error('Roster verification failed:',error.message);process.exitCode=1;}
finally{await db.$disconnect();for(const token of tokens)try{await fetch(`${base}/auth/logout`,{method:'POST',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});}catch{}}
