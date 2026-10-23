import { selectFixtureUser } from '../../testing/session-fixture';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { SessionNavigationService } from './session-navigation.service';
import { authenticateAdminFixture, clearFixtureSession } from '../../testing/session-fixture';

describe('Profile navigation', () => {
  it('keeps the confirmation result visible when the verified session is persisted', () => {
    clearFixtureSession();
    const navigateByUrl = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: Router, useValue: { url: '/confirmar-correo#access_token=verified', navigateByUrl } }] });
    const http = TestBed.inject(HttpTestingController); const session = authenticateAdminFixture(http);
    TestBed.inject(SessionNavigationService); TestBed.tick();
    selectFixtureUser(session, '9'); TestBed.tick();
    expect(navigateByUrl).not.toHaveBeenCalled(); http.verify(); clearFixtureSession();
  });
  it('does not leave public verification when a session expires', () => {
    clearFixtureSession();
    const navigateByUrl = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({ providers: [provideHttpClient(),provideHttpClientTesting(),{ provide: Router,useValue: { url: '/verificar/8F72A91C',navigateByUrl } }] });
    const http = TestBed.inject(HttpTestingController); const session = authenticateAdminFixture(http);
    TestBed.inject(SessionNavigationService); TestBed.tick(); session.endSessionLocally(); TestBed.tick();
    expect(navigateByUrl).not.toHaveBeenCalled(); http.verify(); clearFixtureSession();
  });
  it('navigates to the home page for each authenticated role change', () => {
    clearFixtureSession();
    const navigateByUrl = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: Router, useValue: { navigateByUrl } }] });
    const http = TestBed.inject(HttpTestingController);
    const session = authenticateAdminFixture(http);
    TestBed.inject(SessionNavigationService); TestBed.tick();
    expect(navigateByUrl).not.toHaveBeenCalled();
    selectFixtureUser(session, '8'); TestBed.tick(); expect(navigateByUrl).toHaveBeenLastCalledWith('/cursos');
    selectFixtureUser(session, '9'); TestBed.tick(); expect(navigateByUrl).toHaveBeenLastCalledWith('/mis-cursos');
    selectFixtureUser(session, '1'); TestBed.tick(); expect(navigateByUrl).toHaveBeenLastCalledWith('/cursos');
    session.endSessionLocally(); TestBed.tick(); expect(navigateByUrl).toHaveBeenLastCalledWith('/iniciar-sesion');
    http.verify(); clearFixtureSession();
  });
});
