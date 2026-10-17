import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const prefix = '[PRUEBA FLUJO] ';
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('connect_timeout', '15');
url.searchParams.set('pool_timeout', '30');
url.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
try {
  const result = await db.$transaction(async (tx) => {
    const courses = await tx.$queryRaw`SELECT id::text AS id,nombre FROM public.cursos WHERE left(nombre,${prefix.length}::integer)=${prefix} FOR UPDATE`;
    const certificates = await tx.$queryRaw`SELECT id::text AS id,datos_emision FROM public.certificados WHERE left(datos_emision->>'courseName',${prefix.length}::integer)=${prefix} FOR UPDATE`;
    await writeFile(new URL(`../.local/flow-title-label-backup-${Date.now()}.json`, import.meta.url), JSON.stringify({ courses, certificates }, null, 2), { flag: 'wx' });
    const updatedCourses = await tx.$executeRaw`UPDATE public.cursos SET nombre=substring(nombre from ${prefix.length + 1}::integer) WHERE left(nombre,${prefix.length}::integer)=${prefix}`;
    const updatedCertificates = await tx.$executeRaw`UPDATE public.certificados SET datos_emision=jsonb_set(datos_emision,'{courseName}',to_jsonb(substring(datos_emision->>'courseName' from ${prefix.length + 1}::integer))) WHERE left(datos_emision->>'courseName',${prefix.length}::integer)=${prefix}`;
    const [remaining] = await tx.$queryRaw`SELECT (SELECT count(*)::integer FROM public.cursos WHERE left(nombre,${prefix.length}::integer)=${prefix}) AS courses,(SELECT count(*)::integer FROM public.certificados WHERE left(datos_emision->>'courseName',${prefix.length}::integer)=${prefix}) AS certificates`;
    if (remaining.courses || remaining.certificates) throw new Error('Label removal incomplete.');
    return { updatedCourses, updatedCertificates, remaining };
  }, { timeout: 30000, maxWait: 30000 });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error('Label update rolled back:', error.code ?? error.message);
  process.exitCode = 1;
} finally { await db.$disconnect(); }
