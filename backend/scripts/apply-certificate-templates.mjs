import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
const db=new PrismaClient();
const sql=await readFile(new URL('../prisma/migrations/20261016070000_certificate_templates/migration.sql',import.meta.url),'utf8');
const statements=[];let offset=0;
for(const token of sql.matchAll(/(\$\w*\$)[\s\S]*?\1|'(?:''|[^'])*'|--[^\n]*|;/g)){
  if(token[0]!==';')continue;
  const statement=sql.slice(offset,token.index).replace(/--[^\n]*/g,'').trim();offset=token.index+1;
  if(statement&&!/^(BEGIN|COMMIT)$/i.test(statement))statements.push(statement);
}
try{
  const report=await db.$transaction(async tx=>{
    await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
    const [exists]=await tx.$queryRaw`SELECT to_regclass('public.plantillas_certificados')::text AS existing`;
    if(exists.existing)throw new Error('Templates already installed; do not reapply.');
    const certificates=await tx.$queryRaw`SELECT to_jsonb(t) AS row FROM public.certificados t ORDER BY id`;
    await writeFile(new URL(`../.local/before-certificate-templates-${Date.now()}.json`,import.meta.url),JSON.stringify(certificates,null,2),{flag:'wx'});
    for(const statement of statements)await tx.$executeRawUnsafe(statement);
    const config={institution:'EVA · Formación continua',department:'Laboratorio de Informática',title:'CERTIFICADO',intro:'Se otorga el presente certificado a',signatoryName:'Autoridad institucional',signatoryRole:'Formación continua',footer:'Documento electrónico de formación continua.',primaryColor:'#064542',accentColor:'#A8854D',backgroundColor:'#FCF9F3',font:'serif',layout:'classic',logo:'',signature:''};
    for(const type of ['aprobacion','participacion']){
      const reason=type==='aprobacion'?'por haber aprobado satisfactoriamente el curso':'por su participación en el curso';
      const name=type==='aprobacion'?'Aprobación institucional':'Participación institucional';
      await tx.$executeRaw`INSERT INTO public.plantillas_certificados(nombre,tipo,config,clave_inicial) VALUES(${name},${type},${JSON.stringify({...config,reason})}::jsonb,${type})`;
    }
    const after=await tx.$queryRaw`SELECT to_jsonb(t) AS row FROM public.certificados t ORDER BY id`;
    if(JSON.stringify(after)!==JSON.stringify(certificates))throw new Error('Existing certificates changed.');
    return {templates:2,existingCertificatesPreserved:certificates.length};
  },{timeout:60000,maxWait:30000});
  console.log(JSON.stringify(report));
}catch(error){console.error('Template migration rolled back:',error.code??error.message);process.exitCode=1;}
finally{await db.$disconnect();}
