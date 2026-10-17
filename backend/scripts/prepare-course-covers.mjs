import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { writeFile } from 'node:fs/promises';
const db=new PrismaClient();
try{
  await db.$executeRaw`ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS portada_url TEXT`;
  await db.$executeRaw`NOTIFY pgrst, 'reload schema'`;
  const foreignKeys=await db.$queryRaw`SELECT t.relname AS child,r.relname AS parent,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_class r ON r.oid=c.confrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace WHERE c.contype='f' AND n.nspname='public' ORDER BY t.relname`;
  const columns=await db.$queryRaw`SELECT table_name,column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('cursos','becas','preinscripciones','resultados_curso','anulaciones_certificados') ORDER BY table_name,ordinal_position`;
  await writeFile(new URL('../.local/course-reset-schema.json',import.meta.url),JSON.stringify({foreignKeys,columns},null,2));
  console.log(JSON.stringify({coverColumnReady:true,foreignKeys}));
}catch(error){console.error(error.code??error.message);process.exitCode=1;}finally{await db.$disconnect();}
