import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { SessionNavigationService } from './session-navigation.service';
import { authenticateAdminFixture, clearFixtureSession } from '../../testing/session-fixture';

describe('Profile navigation', () => {
  it('navigates to the home page for each authenticated role change', () => {
    clearFixtureSession();
    const navigateByUrl = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: Router, useValue: { navigateByUrl } }] });
    const http = TestBed.inject(HttpTestingController);
    const session = authenticateAdminFixture(http);
    TestBed.inject(SessionNavigationService); TestBed.tick();
    expect(navigateByUrl).not.toHaveBeenCalled();
    session.selectUser('8'); TestBed.tick(); expect(navigateByUrl).toHaveBeenLastCalledWith('/cursos');
    session.selectUser('9'); TestBed.tick(); expect(navigateByUrl).toHaveBeenLastCalledWith('/catalogo');
    session.selectUser('1'); TestBed.tick(); expect(navigateByUrl).toHaveBeenLastCalledWith('/cursos');
    session.endSessionLocally(); TestBed.tick(); expect(navigateByUrl).toHaveBeenLastCalledWith('/iniciar-sesion');
    http.verify(); clearFixtureSession();
  });
});
