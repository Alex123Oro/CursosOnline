import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { environment } from '../environments/environment';

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
  it('shows the persisted instructor after user options arrive', () => {
    localStorage.setItem('eva-user-id', '8');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/session/users`).flush([
      { id: '1', name: 'Admin', role: 'ADMIN' }, { id: '8', name: 'Carla', role: 'INSTRUCTOR' }
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('select').value).toBe('8');
    fixture.destroy(); localStorage.removeItem('eva-user-id');
  });

  it('keeps the root route pointing to course administration', () => {
    expect(routes.find(route => route.path === '')).toMatchObject({
      redirectTo: 'cursos',
      pathMatch: 'full'
    });
  });

  it('defines the public catalogue route with an accessible title', () => {
    expect(routes.find(route => route.path === 'catalogo')).toMatchObject({
      title: 'Cursos disponibles | EVA'
    });
  });
});
