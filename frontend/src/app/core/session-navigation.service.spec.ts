import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { SessionNavigationService } from './session-navigation.service';
import { SessionService } from './session.service';

describe('Profile navigation', () => {
  it('preserves startup deep links and navigates on each subsequent profile change', () => {
    localStorage.removeItem('eva-user-id');
    const navigateByUrl = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: Router, useValue: { navigateByUrl } }] });
    TestBed.inject(SessionNavigationService); TestBed.tick();
    TestBed.inject(HttpTestingController).expectOne(request => request.url.endsWith('/session/users')).flush([{ id: '1', role: 'ADMIN' }, { id: '3', role: 'PARTICIPANT' }, { id: '5', role: 'INSTRUCTOR' }]);
    TestBed.tick(); expect(navigateByUrl).not.toHaveBeenCalled();
    const session = TestBed.inject(SessionService);
    session.selectUser('5'); TestBed.tick(); expect(navigateByUrl).toHaveBeenLastCalledWith('/cursos');
    session.selectUser('3'); TestBed.tick(); expect(navigateByUrl).toHaveBeenLastCalledWith('/catalogo');
    session.selectUser('1'); TestBed.tick(); expect(navigateByUrl).toHaveBeenLastCalledWith('/cursos');
    TestBed.inject(HttpTestingController).verify(); localStorage.removeItem('eva-user-id');
  });
});
