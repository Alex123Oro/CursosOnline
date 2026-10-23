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

  it.each([
    { role: 'ADMIN', groups: ['Formación', 'Instructores', 'Certificación'], links: ['/cursos', '/inscripciones', '/catalogo', '/instructores', '/asignaciones-instructores', '/asistencia-instructores', '/certificados', '/plantillas-certificados'] },
    { role: 'INSTRUCTOR', groups: ['Formación'], links: ['/cursos', '/catalogo'] },
    { role: 'PARTICIPANT', groups: ['Mi formación', 'Certificación', 'Explorar'], links: ['/mis-cursos', '/mis-inscripciones', '/mi-asistencia', '/mis-calificaciones', '/mis-resultados', '/mi-progreso', '/mis-certificados', '/catalogo'] },
  ])('keeps $role navigation visible under static group labels with an icon per link', ({ role, groups, links }) => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(SessionService).login('navigation@example.test', 'secret').subscribe();
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/auth/login`).flush({
      accessToken: 'token', refreshToken: 'refresh', expiresAt: null,
      user: { id: '8', name: 'Usuario', email: 'navigation@example.test', role, participantTypeId: null, participantTypeName: null }
    });
    fixture.detectChanges();
    const nav: HTMLElement = fixture.nativeElement.querySelector('nav');
    expect(Array.from(nav.querySelectorAll('.nav-label'), label => label.textContent?.trim())).toEqual(groups);
    expect(Array.from(nav.querySelectorAll('a'), link => link.getAttribute('href'))).toEqual(links);
    expect(nav.querySelector('button, details, [aria-expanded]')).toBeNull();
    for (const group of nav.querySelectorAll('.nav-group')) {
      expect(group.querySelectorAll('a').length).toBeGreaterThan(0);
      expect(group.getAttribute('aria-labelledby')).toBe(group.querySelector('.nav-label')?.id);
    }
    for (const link of nav.querySelectorAll('a')) {
      expect(link.querySelector('svg.nav-icon[aria-hidden="true"]')).not.toBeNull();
      expect(link.querySelector('span')?.textContent?.trim()).toBeTruthy();
    }
    fixture.destroy();
    localStorage.clear();
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
