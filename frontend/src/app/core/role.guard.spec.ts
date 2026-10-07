import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom, Observable } from 'rxjs';
import { roleGuard } from './role.guard';
import { environment } from '../../environments/environment';
describe('role guard', () => {
  beforeEach(() => { localStorage.removeItem('eva-user-id'); TestBed.configureTestingModule({providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting()]}); });
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); localStorage.removeItem('eva-user-id'); });
  it.each(['ADMIN','INSTRUCTOR','PARTICIPANT'] as const)('waits for discovery and resolves admin access for %s', async role => {
    const result = TestBed.runInInjectionContext(() => roleGuard(['ADMIN'])({} as ActivatedRouteSnapshot,{} as RouterStateSnapshot)) as Observable<boolean|UrlTree>;
    let resolved=false; const promise=firstValueFrom(result).then(value=>{resolved=true;return value;}); TestBed.tick(); expect(resolved).toBe(false);
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/session/users`).flush([{id:'1',name:'User',role}]); TestBed.tick();
    const value=await promise; expect(value===true?true:TestBed.inject(Router).serializeUrl(value as UrlTree)).toBe(role==='ADMIN'?true:role==='INSTRUCTOR'?'/cursos':'/catalogo');
  });
  it('redirects to catalogue when identity discovery fails', async () => {
    const result=TestBed.runInInjectionContext(()=>roleGuard(['ADMIN','INSTRUCTOR'])({} as ActivatedRouteSnapshot,{} as RouterStateSnapshot)) as Observable<boolean|UrlTree>;
    const promise=firstValueFrom(result); TestBed.tick(); TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/session/users`).flush({}, {status:500,statusText:'Error'}); TestBed.tick();
    expect(TestBed.inject(Router).serializeUrl(await promise as UrlTree)).toBe('/catalogo');
  });
});
