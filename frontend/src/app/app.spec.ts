import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { SessionService } from './core/session.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
  it('shows the header return link for a signed-in instructor', () => {
    const fixture = TestBed.createComponent(App);
    const session = TestBed.inject(SessionService);
    session.login('carla@example.test', 'secret').subscribe();
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/auth/login`).flush({
      accessToken: 'token', refreshToken: 'refresh', expiresAt: null,
      user: { id: '8', name: 'Carla', email: 'carla@example.test', role: 'INSTRUCTOR', participantTypeId: null, participantTypeName: null }
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.workspace-header .header-courses-link')?.getAttribute('href')).toBe('/cursos');
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    fixture.destroy(); localStorage.removeItem('eva-user-id');
    localStorage.removeItem('eva-user'); localStorage.removeItem('eva-access-token');
  });

  it('opens the public catalogue at the root route', () => {
    expect(routes.find(route => route.path === '')).toMatchObject({
      redirectTo: 'catalogo',
      pathMatch: 'full'
    });
  });

  it('defines the public catalogue route with an accessible title', () => {
    expect(routes.find(route => route.path === 'catalogo')).toMatchObject({
      title: 'Cursos disponibles | EVA'
    });
  });
});
