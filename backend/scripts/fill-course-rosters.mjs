import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const apply=process.argv.includes('--apply');
const local=new URL('../.local/',import.meta.url);
const dataset='eva-rosters-20-20261016';
const db=new PrismaClient();
const auth=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(20000)})}
});
const names=['Adriana Vega','Bruno Aguilar','Claudia Paredes','Daniel Mercado','Elena Salinas','Felipe Cabrera','Gloria Méndez','Héctor Arias','Irene Molina','Javier Miranda','Karina Soto','Leonardo Fuentes','Mónica Céspedes','Nelson Villarroel','Olivia Alvarado','Pablo Montaño','Rocío Escobar','Samuel Vargas','Teresa Jiménez','Víctor Salcedo'];
try{
  const courses=await db.$queryRaw`SELECT c.id::integer AS id,c.codigo AS code,c.nombre AS name,c.capacidad AS capacity,
    count(i.id)::integer AS occupied,count(i.id) FILTER(WHERE i.estado::text='inscrito')::integer AS confirmed
    FROM public.cursos c LEFT JOIN public.inscripciones i ON i.curso_id=c.id WHERE c.es_demostracion GROUP BY c.id ORDER BY c.id`;
  if(courses.length!==26)throw new Error('Unexpected demonstration course scope; review before applying.');
  console.log(JSON.stringify({courses:courses.length,enrollmentsToAdd:courses.reduce((n,c)=>n+Math.max(0,20-c.confirmed),0),newParticipants:20}));
  if(!apply)process.exitCode=0;
  else{
    const credentialsUrl=new URL('roster-participant-credentials.json',local);
    let credentials;
    try{credentials=JSON.parse(await readFile(credentialsUrl,'utf8'));}
    catch(error){
      if(error.code!=='ENOENT')throw error;
      credentials={dataset,users:names.map((name,i)=>({name,email:`participante${String(i+1).padStart(2,'0')}@eva.local`,password:`Eva!${randomBytes(24).toString('base64url')}9a`}))};
      await writeFile(credentialsUrl,JSON.stringify(credentials,null,2),{flag:'wx',mode:0o600});
    }
    if(credentials.dataset!==dataset||credentials.users.length!==20)throw new Error('Unexpected credentials manifest.');
    const identities=[];
    for(let page=1;;page++){
      const result=await auth.auth.admin.listUsers({page,perPage:100});
      if(result.error)throw new Error(`Auth listing: ${result.error.code}`);
      identities.push(...result.data.users);
      if(result.data.users.length<100)break;
    }
    const types=await db.participantType.findMany({orderBy:{id:'asc'}});
    if(!types.length)throw new Error('Participant types missing.');
    for(const [index,user] of credentials.users.entries()){
      let identity=identities.find(item=>item.email===user.email);
      if(identity&&identity.user_metadata?.eva_test_dataset!==dataset)throw new Error('An email belongs to another dataset.');
      if(!identity){
        const result=await auth.auth.admin.createUser({email:user.email,password:user.password,email_confirm:true,user_metadata:{full_name:user.name,eva_test_dataset:dataset}});
        if(result.error||!result.data.user)throw new Error(`Auth creation: ${result.error?.code}`);
        identity=result.data.user;
      }
      user.authId=identity.id;
      user.participantTypeId=types[index%types.length].id;
      await writeFile(credentialsUrl,JSON.stringify(credentials,null,2),{mode:0o600});
      console.log(JSON.stringify({identitiesReady:index+1,total:20}));
    }
    const result=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(431231020)::text`;
      await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
      const backup={};
      for(const table of ['cursos','inscripciones','pagos','precios_curso','usuarios'])backup[table]=await tx.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM public."${table}" t`);
      await writeFile(new URL(`roster-backup-${Date.now()}.json`,local),JSON.stringify(backup,null,2),{flag:'wx'});
      await tx.user.createMany({data:credentials.users.map(user=>({authId:user.authId,email:user.email,name:user.name,role:'PARTICIPANT',participantTypeId:user.participantTypeId})),skipDuplicates:true});
      let participants=await tx.user.findMany({where:{email:{in:credentials.users.map(user=>user.email)}},orderBy:{id:'asc'}});
      if(participants.length!==20||participants.some(p=>p.role!=='PARTICIPANT'||!credentials.users.some(u=>u.authId===p.authId)))throw new Error('Profile ownership mismatch.');
      // Supabase's Auth trigger can create the profile before this script, without its category.
      for(const user of credentials.users)await tx.user.update({where:{authId:user.authId},data:{name:user.name,participantTypeId:user.participantTypeId}});
      participants=await tx.user.findMany({where:{email:{in:credentials.users.map(user=>user.email)}},orderBy:{id:'asc'}});
      const completed=[];
      let added=0;
      for(const course of courses){
        const existing=await tx.enrollment.findMany({where:{courseId:course.id},select:{participantId:true,status:true}});
        const needed=Math.max(0,20-existing.filter(e=>e.status==='INSCRITO').length);
        const candidates=participants.filter(p=>!existing.some(e=>e.participantId===p.id)).slice(0,needed);
        if(candidates.length!==needed)throw new Error(`Insufficient participants for course ${course.id}`);
        const prices=await tx.coursePrice.findMany({where:{courseId:course.id}});
        if(!prices.length)throw new Error(`No reference price in course ${course.id}`);
        const missingTypes=[...new Set(candidates.map(p=>p.participantTypeId))].filter(id=>!prices.some(price=>price.participantTypeId===id));
        if(missingTypes.length){
          const referencePrice=prices[0].basePrice;
          await tx.coursePrice.createMany({data:missingTypes.map(participantTypeId=>({courseId:course.id,participantTypeId,basePrice:referencePrice}))});
          for(const participantTypeId of missingTypes)prices.push({courseId:course.id,participantTypeId,basePrice:referencePrice});
        }
        const totalScholarship=course.code==='EVA-BECA-TOTAL';
        const records=candidates.map(p=>{
          const price=prices.find(item=>item.participantTypeId===p.participantTypeId);
          if(!price)throw new Error(`Missing price in course ${course.id}`);
          const basePrice=Number(price.basePrice);
          return {courseId:course.id,participantId:p.id,participantTypeId:p.participantTypeId,status:'INSCRITO',basePrice,
            scholarshipPercent:totalScholarship?100:0,scholarshipActive:totalScholarship,scholarshipReason:totalScholarship?'Beca de formación':null,
            benefitAmount:totalScholarship?basePrice:0,finalAmount:totalScholarship?0:basePrice,confirmedAt:new Date()};
        });
        if(records.length){
          await tx.enrollment.createMany({data:records});
          const created=await tx.enrollment.findMany({where:{courseId:course.id,participantId:{in:candidates.map(p=>p.id)}}});
          const paid=created.filter(e=>Number(e.finalAmount)>0);
          if(paid.length)await tx.payment.createMany({data:paid.map(e=>({enrollmentId:e.id,amount:e.finalAmount}))});
        }
        const occupied=existing.length+records.length;
        await tx.$executeRaw`UPDATE public.cursos SET capacidad=CASE WHEN capacidad IS NOT NULL THEN greatest(capacidad,${occupied}::integer) ELSE NULL END,
          cupo_maximo=CASE WHEN cupo_maximo IS NOT NULL THEN greatest(cupo_maximo,${occupied}::integer) ELSE NULL END
          WHERE id=${course.id}`;
        added+=records.length;
        completed.push({id:course.id,code:course.code,confirmed:existing.filter(e=>e.status==='INSCRITO').length+records.length,added:records.length});
      }
      const [check]=await tx.$queryRaw`SELECT count(*)::integer AS underfilled FROM (
        SELECT c.id FROM public.cursos c LEFT JOIN public.inscripciones i ON i.curso_id=c.id AND i.estado::text='inscrito'
        WHERE c.es_demostracion GROUP BY c.id HAVING count(i.id)<20) x`;
      if(check.underfilled)throw new Error('A course still has fewer than 20 confirmed participants.');
      const [payments]=await tx.$queryRaw`SELECT count(*)::integer AS invalid FROM public.inscripciones i
        JOIN public.usuarios u ON u.id=i.participante_id LEFT JOIN public.pagos p ON p.inscripcion_id=i.id
        WHERE u.auth_id::text IN (SELECT jsonb_array_elements_text(${JSON.stringify(credentials.users.map(u=>u.authId))}::jsonb))
        AND i.estado::text='inscrito' AND i.monto_final>0 AND (p.id IS NULL OR p.monto<i.monto_final)`;
      if(payments.invalid)throw new Error('A new confirmed enrollment is unpaid.');
      return {added,courses:completed,verified:true};
    },{timeout:180000,maxWait:30000});
    await writeFile(new URL('roster-population-result.json',local),JSON.stringify(result,null,2));
    const guideUrl=new URL('../../PRUEBAS_FLUJO.md',import.meta.url);
    const guide=await readFile(guideUrl,'utf8');
    const note='> Actualización: los 26 cursos de ejemplo tienen al menos 20 inscritos confirmados. Se conservaron las preinscripciones y se amplió la capacidad donde hacía falta. Los nuevos inscritos tienen sus pagos o becas correspondientes; sus notas y asistencias quedan pendientes. Los recuentos iniciales de los escenarios de abajo son históricos. Accesos adicionales: `backend/.local/roster-participant-credentials.json`.\n\n';
    if(!guide.includes('roster-participant-credentials.json'))await writeFile(guideUrl,note+guide);
    console.log(JSON.stringify({added:result.added,courses:result.courses.length,verified:result.verified,credentials:'.local/roster-participant-credentials.json'}));
  }
}catch(error){console.error('Roster population stopped:',error.code??error.message);process.exitCode=1;}
finally{await db.$disconnect();}
