import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
const sql = await readFile(new URL('../prisma/migrations/20261016040000_demo_display_names/migration.sql', import.meta.url), 'utf8');
const statements=[];let offset=0;
for(const token of sql.matchAll(/(\$\w*\$)[\s\S]*?\1|'(?:''|[^'])*'|--[^\n]*|;/g)) {
  if(token[0]!==';')continue;
  const statement=sql.slice(offset,token.index).replace(/--[^\n]*/g,'').trim();offset=token.index+1;
  if(statement&&!/^(BEGIN|COMMIT)$/i.test(statement))statements.push(statement);
}
const url=new URL(process.env.DATABASE_URL);url.searchParams.set('connect_timeout','15');url.searchParams.set('pool_timeout','30');url.searchParams.set('connection_limit','1');
const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
try {
  const report=await db.$transaction(async tx=>{
    await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
    const [existing]=await tx.$queryRaw`SELECT to_regprocedure('public.clean_demo_display_name(text)')::text AS existing`;
    if(existing.existing)throw new Error('Already applied; do not reapply.');
    const courses=await tx.$queryRaw`SELECT id::text AS id,nombre FROM public.cursos`;
    const users=await tx.$queryRaw`SELECT id::text AS id,nombre_completo,nombre FROM public.usuarios`;
    const certificates=await tx.$queryRaw`SELECT id::text AS id,datos_emision FROM public.certificados`;
    await writeFile(new URL(`../.local/demo-display-names-backup-${Date.now()}.json`,import.meta.url),JSON.stringify({courses,users,certificates},null,2),{flag:'wx'});
    for(const statement of statements)await tx.$executeRawUnsafe(statement);
    const [remaining]=await tx.$queryRaw`SELECT
      (SELECT count(*)::integer FROM public.cursos WHERE nombre ~* '\\[(PRUEBA|DEMO)' OR nombre ILIKE '%DEMOSTRACION SIN VALIDEZ ACADEMICA%') AS "courseLabels",
      (SELECT count(*)::integer FROM public.usuarios WHERE nombre_completo ~* '\\[(PRUEBA|DEMO)' OR nombre_completo LIKE 'Participante de prueba %') AS "userLabels",
      (SELECT count(*)::integer FROM public.certificados WHERE datos_emision->>'courseName' ILIKE '%DEMOSTRACION SIN VALIDEZ ACADEMICA%' OR datos_emision->>'participantName' ~* '\\[(PRUEBA|DEMO)') AS "certificateLabels",
      (SELECT count(*)::integer FROM public.cursos WHERE es_demostracion) AS "demoCourses",
      (SELECT count(*)::integer FROM public.certificados WHERE datos_emision->>'demo'='true') AS "demoCertificates"`;
    if(remaining.courseLabels||remaining.userLabels||remaining.certificateLabels)throw new Error('Some labels remain.');
    const [sample]=await tx.$queryRaw`SELECT public.clean_demo_display_name('[PRUEBA] Curso de ejemplo - DEMOSTRACION SIN VALIDEZ ACADEMICA') AS name`;
    if(sample.name!=='Curso de ejemplo')throw new Error('Name normalizer failed.');
    return {courses:courses.length,users:users.length,certificates:certificates.length,...remaining};
  },{timeout:60000,maxWait:30000});
  console.log(JSON.stringify(report));
}catch(error){console.error('Display label migration rolled back:',error.code??error.message);process.exitCode=1;}
finally{await db.$disconnect();}
