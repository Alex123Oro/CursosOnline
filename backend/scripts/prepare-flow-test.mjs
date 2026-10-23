import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const container=process.env.FLOW_TEST_CONTAINER ?? '';
assert(container.startsWith('eva-certificates-test-'),'An explicitly labelled local test container is required.');
const inspect=spawnSync('docker',['inspect',container],{encoding:'utf8'});
assert.equal(inspect.status,0); const [info]=JSON.parse(inspect.stdout);
assert.equal(info.Config.Labels['eva.certificates.test'],'true');
const binding=info.NetworkSettings.Ports['5432/tcp'][0]; assert.equal(binding.HostIp,'127.0.0.1');
const password=info.Config.Env.find(s=>s.startsWith('POSTGRES_PASSWORD=')).slice(18);
const sql=(database,input)=>{const r=spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-X','-qAt','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',timeout:30000});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();};
const name='eva_flow_fixes_test';
if(sql('postgres',`SELECT count(*) FROM pg_database WHERE datname='${name}'`)==='0') sql('postgres',`CREATE DATABASE ${name}`);
process.env.DATABASE_URL=`postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${binding.HostPort}/${name}?schema=public&connection_limit=4`;
const hasSchema=sql(name,"SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='usuarios'");
if(hasSchema==='0') {
 const push=spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','push','--skip-generate'],{encoding:'utf8',env:process.env,timeout:60000}); assert.equal(push.status,0,push.stderr);
 sql(name,'ALTER TABLE sesiones ADD COLUMN hora_inicio time;');
 for(const migration of ['20261016010000_certificates','20261016020000_certificate_participation','20261016030000_live_workflow_compatibility','20261016070000_certificate_templates','20261018100000_add_academic_management','20261022100000_security_and_academic_rules']) sql(name,readFileSync(`prisma/migrations/${migration}/migration.sql`,'utf8'));
}
if(sql(name,"SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='emit_certificate_with_template'")==='0') {
 sql(name,'ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS hora_inicio time;');
 for(const migration of ['20261016030000_live_workflow_compatibility','20261016070000_certificate_templates','20261018100000_add_academic_management','20261022100000_security_and_academic_rules']) sql(name,readFileSync(`prisma/migrations/${migration}/migration.sql`,'utf8'));
}
for(const migration of ['20261023010000_enrollment_lifecycle','20261023011000_flow_consistency','20261023012000_certificate_corrections']) sql(name,readFileSync(`prisma/migrations/${migration}/migration.sql`,'utf8'));
console.log(JSON.stringify({isolated:true,database:name,migrated:true}));
