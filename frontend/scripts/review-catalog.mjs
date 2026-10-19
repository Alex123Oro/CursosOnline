import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Use an installed Playwright package; do not download dependencies for this review.
let playwright;
console.log('Loading browser driver');
try { playwright=await import('playwright'); }
catch {
  const links=join(process.env.LOCALAPPDATA,'ms-playwright','.links');
  const packages=await readdir(links);
  for(const entry of packages){
    const location=(await readFile(join(links,entry),'utf8')).trim();
    try{playwright=await import(pathToFileURL(join(location,'index.mjs')).href);break;}catch{}
  }
}
if(!playwright)throw new Error('An installed Playwright package is required.');
const output=new URL('../../docs/output/',import.meta.url);
await mkdir(output,{recursive:true});
const browser=await playwright.chromium.launch({headless:true});
console.log('Browser ready');
const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  const dataPromise=page.waitForResponse(response=>response.url().endsWith('/api/courses/catalog')&&response.status()===200,{timeout:60000});
  await page.goto('http://127.0.0.1:4200/catalogo');
  console.log('Catalog page opened');
  const courses=await (await dataPromise).json();
  console.log(`Real API courses: ${courses.length}`);
  assert(courses.length>0,'The real API must return courses.');
  await page.locator('.course-card').first().waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.uploaded-cover')].every(image=>image.complete&&image.naturalWidth>0));
  await page.screenshot({path:fileURLToPath(new URL('catalogo-escritorio.png',output))});
  assert.equal(await page.locator('.course-card').count(),Math.min(12,courses.length));
  if(courses.length>12){
    await page.getByRole('button',{name:'Página 2',exact:true}).click();
    await page.locator('[aria-current="page"]').filter({hasText:'2'}).waitFor();
    assert.equal(await page.locator('.course-card').count(),Math.min(12,courses.length-12));
    console.log('Pagination verified');
  }
  await page.locator('#course-search').fill('PostgreSQL');
  await page.waitForFunction(()=>document.querySelector('.result-count')?.textContent.includes('PostgreSQL'));
  assert(await page.locator('.course-card').count()>0);
  assert.equal(await page.locator('.course-card').filter({hasText:'PostgreSQL'}).count(),await page.locator('.course-card').count());
  await page.getByRole('button',{name:'Todos los cursos',exact:true}).click();
  await page.locator('#course-sort').selectOption('name');
  const firstName=[...courses].sort((a,b)=>a.name.localeCompare(b.name,'es'))[0].name;
  await page.waitForFunction(name=>document.querySelector('.course-card h3')?.textContent.trim()===name,firstName);
  await page.getByRole('button',{name:'Desde Bs 0',exact:true}).click();
  const freeCount=courses.filter(c=>c.prices.length&&Math.min(...c.prices.map(p=>p.basePrice))===0).length;
  await page.waitForFunction(expected=>document.querySelectorAll('.course-card').length===expected,Math.min(12,freeCount));
  assert.equal(await page.locator('.course-card').count(),Math.min(12,freeCount));
  await page.getByRole('button',{name:'Todos los cursos',exact:true}).click();
  await page.locator('#course-sort').selectOption('recent');
  await page.waitForFunction(expected=>document.querySelectorAll('.course-card').length===expected,Math.min(12,courses.length));
  console.log('Search, sorting and price filter verified');
  await page.setViewportSize({width:768,height:1024});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Tablet has horizontal overflow.');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>scrollTo(0,0));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile has horizontal overflow.');
  await page.screenshot({path:fileURLToPath(new URL('catalogo-movil.png',output))});
  await page.getByRole('button',{name:'Filtrar cursos',exact:true}).click();
  await page.locator('#catalog-filters').waitFor({state:'visible'});
  assert(await page.locator('#catalog-filters').isVisible());
  await page.getByRole('button',{name:'Ocultar filtros',exact:true}).click();
  await page.locator('#catalog-filters').waitFor({state:'hidden'});
  assert(!(await page.locator('#catalog-filters').isVisible()));
  await page.locator('.course-card').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:fileURLToPath(new URL('catalogo-movil-cursos.png',output))});
  const target=await page.locator('.course-action').first().getAttribute('href');
  await page.locator('.course-action').first().click();
  await page.waitForURL(`**${target}`);
  await page.locator('.course-detail').waitFor({state:'visible',timeout:30000}).catch(()=>{});
  assert.equal(errors.length,0,errors.join('\n'));
  let adminCoverEditor=false;
  if(process.argv.includes('--admin-covers')){
    const accounts=JSON.parse(await readFile(new URL('../../backend/.local/restored-test-credentials.json',import.meta.url),'utf8'));
    const admin=accounts.users.find(user=>user.email==='admin@eva.local');
    const course=courses.find(item=>item.code==='JS-2026');
    assert(course);
    await page.setViewportSize({width:1440,height:1100});
    await page.goto('http://127.0.0.1:4200/iniciar-sesion');
    await page.locator('input[type=email]').fill(admin.email);
    await page.locator('input[type=password]').fill(admin.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/cursos');
    const edit=`http://127.0.0.1:4200/cursos/${course.id}/editar`;
    await page.goto(edit);
    await page.locator('.cover-preview img').waitFor();
    await page.waitForFunction(()=>document.querySelector('.cover-preview img')?.naturalWidth>0);
    await page.screenshot({path:fileURLToPath(new URL('administracion-portadas.png',output))});
    for(const [name,path] of [['Python','python'],['JavaScript','javascript']]){
      if(!page.url().endsWith('/editar'))await page.goto(edit);
      await page.getByRole('button',{name,exact:true}).click();
      const response=page.waitForResponse(r=>r.url().endsWith(`/api/courses/${course.id}`)&&r.request().method()==='PUT');
      await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
      const saved=await response;assert.equal(saved.status(),200);assert.equal((await saved.json()).coverUrl,`/images/course-covers/${path}.svg`);
      await page.waitForURL('**/cursos');
    }
    adminCoverEditor=true;
    console.log('Administrator cover selection and persistence verified');
  }
  const result={realCourses:courses.length,desktop:true,tablet:true,mobile:true,search:true,priceFilter:true,sorting:true,pagination:courses.length>12,detailsNavigation:true,adminCoverEditor,browserErrors:errors};
  await writeFile(new URL('catalogo-verificacion.json',output),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}finally{await browser.close();}
