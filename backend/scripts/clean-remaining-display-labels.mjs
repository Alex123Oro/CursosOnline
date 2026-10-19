import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
const sql=await readFile(new URL('../prisma/migrations/20261016050000_remaining_display_labels/migration.sql',import.meta.url),'utf8');
const statements=[];let offset=0;
for(const token of sql.matchAll(/(\$\w*\$)[\s\S]*?\1|'(?:''|[^'])*'|--[^\n]*|;/g)){
  if(token[0]!==';')continue;
  const statement=sql.slice(offset,token.index).replace(/--[^\n]*/g,'').trim();offset=token.index+1;
  if(statement&&!/^(BEGIN|COMMIT)$/i.test(statement))statements.push(statement);
}
const db=new PrismaClient();
const tables=['cursos','inscripciones','calificaciones','evaluaciones','sesiones','asistencias_participantes','asistencias_instructores','certificados'];
try{
  const result=await db.$transaction(async tx=>{
    await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
    const backup={};
    for(const table of tables)backup[table]=await tx.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM public."${table}" t`);
    await writeFile(new URL(`../.local/remaining-labels-backup-${Date.now()}.json`,import.meta.url),JSON.stringify(backup,null,2),{flag:'wx'});
    const changes=[];
    for(const statement of statements)changes.push(await tx.$executeRawUnsafe(statement));
    for(const table of tables){
      const [after]=await tx.$queryRawUnsafe(`SELECT count(*)::integer AS total FROM public."${table}"`);
      if(after.total!==backup[table].length)throw new Error(`Row count changed: ${table}`);
    }
    return {changes,rowsPreserved:true};
  },{timeout:60000,maxWait:30000});
  // Keep the testing guide and course manifests aligned with the displayed codes.
  for(const path of ['../.local/full-workflow-dataset.json','../.local/restored-test-dataset.json','../../PRUEBAS_FLUJO.md']){
    const file=new URL(path,import.meta.url);
    const content=await readFile(file,'utf8');
    await writeFile(file,content.replaceAll('EVA-PRUEBA-','EVA-').replaceAll('EVA-FLUJO-','EVA-'));
  }
  console.log(JSON.stringify(result));
}catch(error){console.error('Label cleanup failed:',error.code??error.message);process.exitCode=1;}
finally{await db.$disconnect();}
