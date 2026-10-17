import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
try {
  const fields = await db.$queryRaw`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('cursos','usuarios','inscripciones','sesiones','evaluaciones','calificaciones','asistencias_instructores','asistencias_participantes') AND data_type IN ('text','character varying') AND column_name NOT IN ('auth_id','correo','telefono','codigo_sis') ORDER BY table_name,column_name`;
  const matches=[];
  for(const {table_name:table,column_name:column} of fields){
    const rows=await db.$queryRawUnsafe(`SELECT id::text AS id,"${column}" AS value FROM public."${table}" WHERE "${column}" ~* $1`, 'prueba|demostraci[oó]n|sint[eé]tic|EVA-FLUJO');
    if(rows.length)matches.push({table,column,count:rows.length,samples:rows.slice(0,5)});
  }
  console.log(JSON.stringify(matches,null,2));
}finally{await db.$disconnect();}
