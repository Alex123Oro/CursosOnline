import { selectFixtureUser } from '../../testing/session-fixture';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom, Observable } from 'rxjs';
import { roleGuard } from './role.guard';
import { authenticateAdminFixture, clearFixtureSession } from '../../testing/session-fixture';

describe('role guard', () => {
  beforeEach(() => { clearFixtureSession(); TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }); });
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); clearFixtureSession(); });
  it.each([['ADMIN', '1', true], ['INSTRUCTOR', '8', '/cursos'], ['PARTICIPANT', '9', '/catalogo']] as const)('enforces access for %s', async (_role, id, expected) => {
    const session = authenticateAdminFixture(TestBed.inject(HttpTestingController));
    selectFixtureUser(session, id);
    const result = TestBed.runInInjectionContext(() => roleGuard(['ADMIN'])({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) as Observable<boolean | UrlTree>;
    const value = await firstValueFrom(result);
    expect(value === true ? true : TestBed.inject(Router).serializeUrl(value as UrlTree)).toBe(expected);
  });
  it('redirects guests to login without making an identity-discovery request', async () => {
    const result = TestBed.runInInjectionContext(() => roleGuard(['ADMIN', 'INSTRUCTOR'])({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) as Observable<boolean | UrlTree>;
    const value = await firstValueFrom(result);
    expect(TestBed.inject(Router).serializeUrl(value as UrlTree)).toBe('/iniciar-sesion');
    TestBed.inject(HttpTestingController).expectNone(request => request.url.endsWith('/session/users'));
  });
});
