import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
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
