import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { mkdir,writeFile } from 'node:fs/promises';

const db=new PrismaClient();
const tables=['inscripciones','pagos','precios_curso','tipos_participante'];
try {
  const privileges=await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return tx.$queryRaw`SELECT c.relname AS name,c.relrowsecurity AS rls,r.rolname AS role,
      has_table_privilege(r.oid,c.oid,'SELECT') AS can_select,has_table_privilege(r.oid,c.oid,'INSERT') AS can_insert,
      has_table_privilege(r.oid,c.oid,'UPDATE') AS can_update,has_table_privilege(r.oid,c.oid,'DELETE') AS can_delete
      FROM pg_class c CROSS JOIN pg_roles r WHERE c.relnamespace='public'::regnamespace
        AND c.relname IN ('inscripciones','pagos','precios_curso','tipos_participante')
        AND r.rolname IN ('anon','authenticated') ORDER BY c.relname,r.rolname`;
  });
  assert.equal(privileges.length,8);
  assert(privileges.every(row => row.rls && !row.can_select && !row.can_insert && !row.can_update && !row.can_delete));
  const publicChecks=[];
  const serviceChecks=[];
  assert(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SECRET_KEY);
  const service=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{
    auth:{ persistSession:false,autoRefreshToken:false },
    global:{ fetch:(url,options={}) => fetch(url,{ ...options,signal:AbortSignal.timeout(10000) }) }
  });
  for(const table of tables){
    const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`,{
      method:'HEAD',headers:{ apikey:process.env.SUPABASE_PUBLISHABLE_KEY },signal:AbortSignal.timeout(10000)
    });
    publicChecks.push({ table,session:'NONE',method:'HEAD',status:response.status });
    assert([401,403].includes(response.status),'Anonymous data API access must be denied.');
    const {error}=await service.from(table).select('id',{ head:true });
    serviceChecks.push({ table,accessible:!error });
    assert.equal(error,null,'Backend service role access must be preserved.');
  }
  const account=await db.user.findFirst({ select:{ id:true,active:true } });
  const [assessment]=await db.$queryRaw`SELECT pg_get_functiondef('public.certificate_assessment_for_type(bigint,text)'::regprocedure) AS definition`;
  const report={ verified:true,mode:'READ ONLY',privileges,publicChecks,serviceChecks,
    activeFieldReadable:account===null || typeof account.active==='boolean' || account.active===null,
    completeWeightsRequired:assessment.definition.includes('abs(e.weight-100)'),
    completeAttendanceRequired:assessment.definition.includes('a.recorded=st.completed') };
  assert(report.activeFieldReadable && report.completeWeightsRequired && report.completeAttendanceRequired);
  await mkdir(new URL('../.local/',import.meta.url),{ recursive:true });
  await writeFile(new URL('../.local/priority-environment-verification.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { await db.$disconnect(); }
