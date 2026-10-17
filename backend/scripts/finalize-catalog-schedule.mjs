import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { catalogCourses, startHourFor } from './catalog-course-definitions.mjs';
const local=new URL('../.local/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('ten-course-catalog.json',local),'utf8'));
const db=new PrismaClient();
try{
  const result=await db.$transaction(async tx=>{
    const courses=await tx.course.findMany({select:{id:true,code:true}});
    if(courses.length!==10||courses.some(c=>!manifest.courses.some(m=>m.id===c.id)))throw new Error('Catalog scope mismatch.');
    const backup=await tx.$queryRaw`SELECT id::text AS id,curso_id::text AS course_id,hora_inicio_api,duracion_minutos FROM public.sesiones ORDER BY id`;
    await writeFile(new URL(`schedule-backup-${Date.now()}.json`,local),JSON.stringify(backup,null,2),{flag:'wx'});
    for(const definition of catalogCourses){
      const course=manifest.courses.find(c=>c.key===definition.key);
      const hour=startHourFor(definition);const startTime=`${String(hour).padStart(2,'0')}:00`;
      await tx.$executeRaw`UPDATE public.sesiones SET hora_inicio_api=${startTime} WHERE curso_id=${course.id}`;
      await tx.course.update({where:{id:course.id},data:{schedule:`${startTime}-${String(hour+definition.minutes/60).padStart(2,'0')}:00`}});
    }
    const overlaps=await tx.$queryRaw`SELECT a.id::text AS first,b.id::text AS second FROM public.sesiones a
      JOIN public.cursos ca ON ca.id=a.curso_id JOIN public.sesiones b ON a.id<b.id AND a.fecha=b.fecha
      JOIN public.cursos cb ON cb.id=b.curso_id AND ca.instructor_id=cb.instructor_id
      WHERE a.hora_inicio<b.hora_fin AND b.hora_inicio<a.hora_fin`;
    if(overlaps.length)throw new Error('An instructor has overlapping sessions.');
    return {instructorScheduleConflicts:overlaps.length,sessions:backup.length};
  },{timeout:60000,maxWait:30000});
  const credentialManifest=JSON.parse(await readFile(new URL('full-workflow-credentials.json',local),'utf8'));
  const account=credentialManifest.users.find(u=>u.email==='valeria.flujo@eva.local');
  const base=`http://localhost:${process.env.PUERTO??3000}/api`;
  const login=await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password}),signal:AbortSignal.timeout(30000)});
  if(!login.ok)throw new Error('Instructor login failed.');
  const {accessToken}=await login.json();
  try{
    const headers={Authorization:`Bearer ${accessToken}`};
    const teaching=await fetch(`${base}/teaching/courses`,{headers,signal:AbortSignal.timeout(30000)});
    if(!teaching.ok)throw new Error('Teaching courses are unavailable.');
    const assigned=await teaching.json();
    if(assigned.length!==3)throw new Error('Expected three assigned courses for this instructor.');
    const sql=manifest.courses.find(c=>c.key==='postgresql');
    for(const path of [`courses/${sql.id}/attendance`,`courses/${sql.id}/evaluations`,`courses/${sql.id}/sessions`]){
      const response=await fetch(`${base}/${path}`,{headers,signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error(`Instructor cannot access ${path}`);
    }
    result.instructorLogin=true;result.instructorCourses=assigned.length;
  }finally{await fetch(`${base}/auth/logout`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`}});}
  await writeFile(new URL('ten-course-schedule-verification.json',local),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}catch(error){console.error('Schedule verification failed:',error.code??error.message);process.exitCode=1;}
finally{await db.$disconnect();}
