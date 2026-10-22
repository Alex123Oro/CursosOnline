import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const backend=fileURLToPath(new URL('../',import.meta.url));
const reserved=createServer();reserved.listen(0,'127.0.0.1');await once(reserved,'listening');
const port=reserved.address().port;
await new Promise(resolve => reserved.close(resolve));
const server=spawn(process.execPath,['start.js'],{ cwd:backend,windowsHide:true,
  env:{ ...process.env,PUERTO:String(port) },stdio:['ignore','pipe','pipe'] });
try {
  await new Promise((resolve,reject) => {
    const timeout=setTimeout(() => reject(new Error('Local backend did not start.')),15000);
    server.stdout.on('data',data => { if(String(data).includes('Backend escuchando')) { clearTimeout(timeout);resolve(); } });
    server.once('error',reject);
    server.once('exit',() => { clearTimeout(timeout);reject(new Error('Local backend stopped.')); });
  });
  const checks=[];
  for(const [path,expected] of [['/api/health',200],['/api/participant-types',200],['/api/courses/catalog',200],['/api/courses',401]]){
    const response=await fetch(`http://127.0.0.1:${port}${path}`,{ signal:AbortSignal.timeout(20000) });
    const body=await response.json();
    assert.equal(response.status,expected,`Unexpected status for ${path}`);
    checks.push({ path,status:response.status,...(Array.isArray(body)?{ items:body.length }:{}) });
  }
  const report={ verified:true,mode:'READ ONLY LOCAL API',checks };
  await mkdir(new URL('../.local/',import.meta.url),{ recursive:true });
  await writeFile(new URL('../.local/priority-public-http.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { server.kill(); if(server.exitCode===null)await once(server,'exit'); }
