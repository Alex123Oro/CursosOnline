import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const links=join(process.env.LOCALAPPDATA,'ms-playwright','.links');
const location=(await readFile(join(links,(await readdir(links))[0]),'utf8')).trim();
const {chromium}=await import(pathToFileURL(join(location,'index.mjs')).href);
const accounts=JSON.parse(await readFile(new URL('../../backend/.local/restored-test-credentials.json',import.meta.url),'utf8'));
const account=accounts.users.find(user=>user.email==='admin@eva.local');
const browser=await chromium.launch({headless:true});
try {
 for(const host of ['127.0.0.1','localhost']) {
  const page=await browser.newPage();const events=[];
  page.on('pageerror',e=>events.push(e.message));
  page.on('response',r=>{if(r.url().includes('certificate-templates'))events.push({url:r.url(),status:r.status(),type:r.headers()['content-type']});});
  try {
   await page.goto(`http://${host}:4200/iniciar-sesion`,{timeout:15000});
   await page.locator('input[type=email]').fill(account.email);await page.locator('input[type=password]').fill(account.password);
   await page.locator('button[type=submit]').click();await page.waitForURL('**/cursos',{timeout:20000});
   await page.goto(`http://${host}:4200/plantillas-certificados`);
   const buttons=page.locator('.template-list button');await buttons.first().waitFor();
   for(let index=0;index<await buttons.count();index++){
    await buttons.nth(index).click();
    const response=await page.waitForResponse(r=>r.url().endsWith('/preview-image')&&r.status()===200);
    await response.finished();
    await page.waitForFunction(()=>{const image=document.querySelector('.pdf-stage img');return image?.complete&&image.naturalWidth===842;},{},{timeout:15000});
   }
   const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar vista previa en PDF'}).click();
   const file=await download;const stream=await file.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);
   const pdf=Buffer.concat(chunks);if(!pdf.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('Invalid PDF');
   events.push({download:file.suggestedFilename(),bytes:pdf.length});
   await page.screenshot({path:fileURLToPath(new URL(`../../docs/output/preview-verified-${host}.png`,import.meta.url))});
   console.log(JSON.stringify({host,events,state:await page.evaluate(()=>({alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent),preview:document.querySelector('.pdf-stage')?.innerHTML?.slice(0,500),images:[...document.querySelectorAll('.pdf-stage img')].map(i=>({width:i.naturalWidth,height:i.naturalHeight,complete:i.complete})),statuses:[...document.querySelectorAll('[role=status]')].map(x=>x.textContent)}))}));
  }catch(e){process.exitCode=1;console.log(JSON.stringify({host,error:e.message,events}));}
  await page.close();
 }
}finally{await browser.close();}
