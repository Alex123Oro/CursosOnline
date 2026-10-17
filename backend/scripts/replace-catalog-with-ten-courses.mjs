import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { catalogCourses, startHourFor } from './catalog-course-definitions.mjs';
const db=new PrismaClient();
const local=new URL('../.local/',import.meta.url);
const apply=process.argv.includes('--apply');
const tables=['anulaciones_certificados','certificados','resultados_curso','calificaciones','asistencias_participantes','asistencias_instructores','pagos','inscripciones','preinscripciones','becas','precios_curso','evaluaciones','sesiones','cursos'];
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/La_Paz'}).format(new Date());
const day=offset=>new Date(Date.parse(`${today}T12:00:00Z`)+offset*86400000).toISOString().slice(0,10);
const date=offset=>new Date(`${day(offset)}T00:00:00Z`);
let stage='preflight';
try{
  let prior;try{prior=JSON.parse(await readFile(new URL('ten-course-catalog.json',local),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(prior?.applied)throw new Error('The ten-course replacement was already applied. Refusing to delete it again.');
  const manifests=await Promise.all(['restored-test-credentials.json','full-workflow-credentials.json','roster-participant-credentials.json'].map(async name=>JSON.parse(await readFile(new URL(name,local),'utf8'))));
  const emails=[...new Set(manifests.flatMap(m=>m.users.map(u=>u.email)))];
  const participants=await db.user.findMany({where:{email:{in:emails},role:'PARTICIPANT'},orderBy:{id:'asc'}});
  const instructors=await db.user.findMany({where:{email:{in:emails},role:'INSTRUCTOR'},orderBy:{id:'asc'}});
  const admin=await db.user.findUnique({where:{email:'maykel.zalazar@gmail.com'}});
  const types=await db.participantType.findMany({orderBy:{id:'asc'}});
  if(participants.length<30||instructors.length!==3||admin?.role!=='ADMIN'||participants.some(p=>p.participantTypeId===null))throw new Error('Expected participant profiles, categories and instructors are required.');
  const plan=await db.$queryRaw`SELECT count(*)::integer AS courses FROM public.cursos`;
  console.log(JSON.stringify({replaceAllCourses:plan[0].courses,newCourses:10,confirmedPerCourse:20,keepUsers:true}));
  if(apply){
    if(plan[0].courses!==29)throw new Error('The existing course inventory changed; review before deleting.');
    const schema=JSON.parse(await readFile(new URL('course-reset-schema.json',local),'utf8'));
    if(schema.foreignKeys.some(f=>tables.includes(f.parent)&&!tables.includes(f.child)))throw new Error('Unreviewed dependent table.');
    const result=await db.$transaction(async tx=>{
      await tx.$executeRaw`SET LOCAL lock_timeout='8s'`;
      await tx.$executeRawUnsafe(`LOCK TABLE ${tables.map(t=>`public."${t}"`).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
      const usersBefore=await tx.user.findMany({select:{id:true,authId:true,email:true,role:true},orderBy:{id:'asc'}});
      const rows={};
      for(const table of tables)rows[table]=(await tx.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM public."${table}" t ORDER BY id`)).map(item=>item.row);
      if(rows.cursos.length!==29)throw new Error('Courses changed before backup.');
      const backup=`catalog-before-replacement-${Date.now()}.json`;
      await writeFile(new URL(backup,local),JSON.stringify({createdAt:new Date().toISOString(),users:usersBefore,rows},null,2),{flag:'wx',mode:0o600});
      for(const table of tables){stage=`delete:${table}`;await tx.$executeRawUnsafe(`DELETE FROM public."${table}"`);}
      const courses=[];
      for(const [courseIndex,definition] of catalogCourses.entries()){
        stage=`course:${definition.key}`;
        const instructor=instructors[courseIndex%instructors.length];
        const startHour=startHourFor(definition);
        const startTime=`${String(startHour).padStart(2,'0')}:00`;
        const offsets=Array.from({length:definition.sessions},(_,i)=>definition.offset+i*2);
        const course=await tx.course.create({data:{
          code:definition.code,name:definition.name,content:definition.content,coverUrl:`/images/course-covers/${definition.key}.svg`,durationHours:definition.hours,
          instructor:instructor.name,instructorId:instructor.id,status:'PUBLISHED',capacity:30,minimumEnrollment:20,
          startDate:date(offsets[0]),endDate:date(offsets.at(-1)),preinscriptionStart:date(definition.phase==='upcoming'?-7:definition.offset-20),
          preinscriptionEnd:date(definition.phase==='upcoming'?definition.offset-1:definition.offset-1),
          schedule:`${startTime}-${String(startHour+definition.minutes/60).padStart(2,'0')}:00`,
          approvalCriteria:definition.participation?'Participación: asistencia mínima del 80%.':'Aprobación: nota mínima de 70/100 y asistencia mínima del 80%. Participación: asistencia mínima del 80%.',
          minimumPassingScore:70,minimumAttendancePercent:80
        }});
        await tx.$executeRaw`UPDATE public.cursos SET es_demostracion=true,horas=${definition.hours},cupo_maximo=30,descripcion=${definition.content} WHERE id=${course.id}`;
        const priceFor=typeId=>definition.price===0?0:definition.price+types.findIndex(t=>t.id===typeId)*30;
        await tx.coursePrice.createMany({data:types.map(type=>({courseId:course.id,participantTypeId:type.id,basePrice:priceFor(type.id)}))});
        const sessions=await tx.courseSession.createManyAndReturn({data:offsets.map((offset,i)=>({courseId:course.id,sessionNumber:i+1,date:date(offset),startTime,durationMinutes:definition.minutes}))});
        sessions.sort((a,b)=>a.sessionNumber-b.sessionNumber);
        const evaluations=definition.participation?[]:await tx.courseEvaluation.createManyAndReturn({data:[{courseId:course.id,title:'Prácticas aplicadas',maxScore:100,weight:40},{courseId:course.id,title:'Proyecto final',maxScore:100,weight:60}]});
        evaluations.sort((a,b)=>a.title.localeCompare(b.title));
        const selected=participants.slice(courseIndex%10,courseIndex%10+20);
        const enrollmentData=selected.map((p,index)=>{
          const basePrice=priceFor(p.participantTypeId);
          const scholarshipPercent=basePrice>0?(index===0?100:index===1?50:0):0;
          const benefitAmount=Math.round(basePrice*scholarshipPercent)/100;
          return {courseId:course.id,participantId:p.id,participantTypeId:p.participantTypeId,status:'INSCRITO',basePrice,
            scholarshipPercent,scholarshipActive:scholarshipPercent>0,scholarshipReason:scholarshipPercent?'Beca de formación':null,
            benefitAmount,finalAmount:basePrice-benefitAmount,confirmedAt:new Date()};
        });
        await tx.enrollment.createMany({data:enrollmentData});
        const confirmed=await tx.enrollment.findMany({where:{courseId:course.id},orderBy:{id:'asc'}});
        const paid=confirmed.filter(e=>Number(e.finalAmount)>0);
        if(paid.length)await tx.payment.createMany({data:paid.map(e=>({enrollmentId:e.id,amount:e.finalAmount}))});
        const attendance=[];const grades=[];
        for(const [index,enrollment] of confirmed.entries()){
          for(const [sessionIndex,session] of sessions.entries()){
            if(session.date>date(0))continue;
            if(definition.phase==='ongoing'&&sessionIndex===sessions.filter(s=>s.date<=date(0)).length-1)continue;
            const absent=definition.key==='seguridad'&&index>=10&&index<15&&sessionIndex>=6;
            attendance.push({courseId:course.id,sessionId:session.id,enrollmentId:enrollment.id,status:absent?'ABSENT':'PRESENT',recordedById:instructor.id});
          }
          for(const [evaluationIndex,evaluation] of evaluations.entries()){
            if(definition.phase==='upcoming'||(definition.phase==='ongoing'&&evaluationIndex===1)||(definition.pendingGrades&&index>=15&&evaluationIndex===1))continue;
            grades.push({evaluationId:evaluation.id,enrollmentId:enrollment.id,score:definition.key==='seguridad'&&index>=15?45:evaluationIndex===0?85:92,recordedById:instructor.id});
          }
        }
        if(attendance.length)await tx.attendance.createMany({data:attendance});
        if(grades.length)await tx.evaluationGrade.createMany({data:grades});
        const teacherSessions=sessions.filter(s=>s.date<=date(0));
        if(definition.phase==='ongoing')teacherSessions.pop();
        if(teacherSessions.length)await tx.instructorAttendance.createMany({data:teacherSessions.map(s=>({courseId:course.id,sessionId:s.id,instructorId:instructor.id,status:'PRESENT',recordedById:admin.id}))});
        const pending=[];
        if(definition.phase==='upcoming'){
          const pendingPeople=participants.filter(p=>!selected.some(s=>s.id===p.id)).slice(0,4);
          for(const [index,participant] of pendingPeople.entries()){
            const basePrice=priceFor(participant.participantTypeId);const percent=index===3?100:0;
            const enrollment=await tx.enrollment.create({data:{courseId:course.id,participantId:participant.id,participantTypeId:participant.participantTypeId,status:'PREINSCRITO',basePrice,
              scholarshipPercent:percent,scholarshipActive:percent>0,scholarshipReason:percent?'Beca de formación':null,
              benefitAmount:percent?basePrice:0,finalAmount:percent?0:basePrice}});
            if(index===1||index===2)await tx.payment.create({data:{enrollmentId:enrollment.id,amount:index===1?Math.round(basePrice/2):basePrice}});
            pending.push({id:enrollment.id,payment:index===1?'partial':index===2?'complete':index===3?'scholarship':'pending'});
          }
        }
        const certificates=[];
        if(definition.phase==='finished'){
          const issueCount=definition.participation?2:4;
          for(let index=0;index<issueCount;index++){
            const type=definition.participation||index>=2?'participacion':'aprobacion';
            const code=randomBytes(4).toString('hex').toUpperCase();
            const publicUrl=new URL(`/verificar/${code}`,process.env.PUBLIC_APP_URL).toString();
            const [issued]=await tx.$queryRaw`SELECT public.emit_certificate_for_type(${BigInt(confirmed[index].id)},${code},${publicUrl},${BigInt(admin.id)},${type}) AS certificate`;
            const revoked=definition.key==='seguridad'&&index===1;
            if(revoked){
              await tx.$executeRaw`UPDATE public.certificados SET estado='anulado' WHERE id=${BigInt(issued.certificate.id)}`;
              await tx.$executeRaw`INSERT INTO public.anulaciones_certificados(certificado_id,anulado_por,motivo) VALUES(${BigInt(issued.certificate.id)},${admin.id},'Corrección de datos del participante')`;
            }
            certificates.push({id:String(issued.certificate.id),code,type,participantId:confirmed[index].participantId,revoked});
          }
        }
        courses.push({id:course.id,key:definition.key,name:course.name,phase:definition.phase,instructorId:instructor.id,confirmed:20,pending,sessions:sessions.length,evaluations:evaluations.length,attendance:attendance.length,grades:grades.length,certificates});
        console.log(JSON.stringify({prepared:definition.key,course:courseIndex+1,total:10}));
      }
      const usersAfter=await tx.user.findMany({select:{id:true,authId:true,email:true,role:true},orderBy:{id:'asc'}});
      if(JSON.stringify(usersAfter)!==JSON.stringify(usersBefore))throw new Error('User profiles changed.');
      const [totals]=await tx.$queryRaw`SELECT (SELECT count(*)::integer FROM public.cursos) AS courses,(SELECT count(*)::integer FROM public.inscripciones WHERE estado::text='inscrito') AS confirmed,(SELECT count(*)::integer FROM public.inscripciones WHERE estado::text='preinscrito') AS pending,(SELECT count(*)::integer FROM public.certificados) AS certificates,(SELECT count(*)::integer FROM public.usuarios) AS users`;
      if(totals.courses!==10||totals.confirmed!==200)throw new Error('Final counts do not match the requested catalog.');
      return {applied:true,completedAt:new Date().toISOString(),backup,removed:Object.fromEntries(tables.map(t=>[t,rows[t].length])),totals,courses};
    },{timeout:240000,maxWait:30000});
    await writeFile(new URL('ten-course-catalog.json',local),JSON.stringify(result,null,2),{flag:'wx'});
    console.log(JSON.stringify({applied:true,backup:result.backup,removed:result.removed,totals:result.totals}));
  }
}catch(error){console.error('Catalog replacement rolled back:',JSON.stringify({stage,code:error.code,message:error.meta?.message??error.message}));process.exitCode=1;}
finally{await db.$disconnect();}
