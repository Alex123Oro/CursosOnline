import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const local=new URL('../.local/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('ten-course-catalog.json',local),'utf8'));
const credentials=(await Promise.all(['restored-test-credentials.json','full-workflow-credentials.json','roster-participant-credentials.json'].map(async name=>JSON.parse(await readFile(new URL(name,local),'utf8'))))).flatMap(m=>m.users);
const base=`http://localhost:${process.env.PUERTO??3000}/api`;
const frontend='http://127.0.0.1:4200';
let requests=0;const tokens=[];
async function api(path,{token,method='GET',body,raw,type,expected=200}={}){
  const response=await fetch(`${base}/${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(raw?{'Content-Type':type??'image/png'}:body?{'Content-Type':'application/json'}:{})},...(raw?{body:raw}:body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  requests++;assert.equal(response.status,expected,`${method} ${path}`);
  return response;
}
async function json(path,token){return (await api(path,{token})).json();}
async function login(account){
  assert(account,'Account missing');const session=await (await api('auth/login',{method:'POST',body:{email:account.email,password:account.password}})).json();tokens.push(session.accessToken);return session.accessToken;
}
try{
  const admin=await login(credentials.find(u=>u.email==='admin@eva.local'));
  const courses=await json('courses',admin);assert.equal(courses.length,10);
  const catalog=await json('courses/catalog');assert.equal(catalog.length,10);
  for(const course of courses){
    assert.equal(course.enrolledCount,20);assert(course.coverUrl.startsWith('/images/course-covers/'));assert(course.prices.length>0);assert.equal(course.minimumEnrollment,20);
    const cover=await fetch(`${frontend}${course.coverUrl}`);assert.equal(cover.status,200);assert((await cover.text()).startsWith('<svg'));
    const sessions=await json(`courses/${course.id}/sessions`,admin);assert.equal(sessions.sessions.reduce((sum,s)=>sum+s.durationMinutes,0)/60,course.durationHours);
    const attendance=await json(`courses/${course.id}/attendance`,admin);assert.equal(attendance.students.length,20);
    const evaluations=await json(`courses/${course.id}/evaluations`,admin);assert.equal(evaluations.length,course.code==='GIT-2026'?0:2);
  }
  const teachers=await json('admin/instructors',admin);assert.equal(teachers.length,3);
  for(const teacher of teachers){const attendance=await json(`admin/instructors/${teacher.id}/attendance`,admin);assert(attendance.sessions.length>0);}
  const users=await json('session/users',admin);assert.equal(users.length,manifest.totals.users);
  const ownerId=manifest.courses.find(c=>c.key==='git').certificates[0].participantId;
  const ownerAccount=credentials.find(c=>c.email===users.find(u=>u.id===String(ownerId)).email);
  const owner=await login(ownerAccount);
  const progress=await json('progress/me',owner);assert(progress.length>0);
  const certificates=await json('certificates/me',owner);assert(certificates.length>0);
  const owned=certificates.find(c=>c.status==='VALID');assert(owned);
  const pdf=await api(`certificates/me/${owned.id}/pdf`,{token:owner});assert((await pdf.arrayBuffer()).byteLength>1000);
  for(const item of manifest.courses.filter(c=>c.phase==='finished')){
    const roster=await json(`courses/${item.id}/certificates?type=${item.key==='git'?'participacion':'aprobacion'}`,admin);assert.equal(roster.students.length,20);
    if(item.key==='seguridad')assert(roster.students.some(s=>s.approvalStatus==='REPROBADO'));
    if(item.key==='analisis')assert(roster.students.some(s=>s.approvalStatus==='PENDIENTE'));
    for(const certificate of item.certificates)await json(`certificates/verify/${certificate.code}`);
  }
  await api('courses/covers',{method:'POST',raw:Buffer.from('invalid'),expected:401});
  await api('courses/covers',{token:owner,method:'POST',raw:Buffer.from('invalid'),expected:403});
  await api('courses/covers',{token:admin,method:'POST',raw:Buffer.from('<html>'),expected:400});
  await api('courses/covers',{token:admin,method:'POST',raw:Buffer.alloc(5*1024*1024+1),expected:413});
  const bytes=await readFile(new URL('../../frontend/public/images/catalog-students.png',import.meta.url));
  const upload=await (await api('courses/covers',{token:admin,method:'POST',raw:bytes,expected:201})).json();
  assert(upload.coverUrl.startsWith('https://'));
  const image=await fetch(upload.coverUrl);assert.equal(image.status,200);assert(image.headers.get('content-type').includes('image/png'));
  const first=courses[0];
  try{
    const saved=await (await api(`courses/${first.id}`,{token:admin,method:'PUT',body:{...first,coverUrl:upload.coverUrl}})).json();assert.equal(saved.coverUrl,upload.coverUrl);
    assert.equal((await json(`courses/catalog/${first.id}`)).coverUrl,upload.coverUrl);
  }finally{
    await api(`courses/${first.id}`,{token:admin,method:'PUT',body:first});
    const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const path=new URL(upload.coverUrl).pathname.split('/course-covers/')[1];
    assert(path&&/^\d+\/[a-f0-9-]+\.png$/.test(path));
    const deletion=await client.storage.from('course-covers').remove([path]);assert(!deletion.error);
  }
  const report={passed:true,requests,totals:manifest.totals,covers:10,realStorageUpload:true,coverPersistence:true,usersPreserved:true,roles:['ADMIN','PARTICIPANT'],teacherAttendance:true};
  await writeFile(new URL('ten-course-verification.json',local),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.error('Catalog verification failed:',error.message);process.exitCode=1;}
finally{for(const token of tokens)try{await api('auth/logout',{token,method:'POST'});}catch{}}
