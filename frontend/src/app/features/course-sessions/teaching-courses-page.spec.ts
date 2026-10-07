import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TeachingCoursesPage } from './teaching-courses-page';
import { SessionService } from '../../core/session.service';

describe('Instructor courses', () => {
  beforeEach(() => {
    localStorage.setItem('eva-user-id', '5');
    TestBed.configureTestingModule({ imports: [TeachingCoursesPage], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  });
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); localStorage.removeItem('eva-user-id'); });
  it('paginates eight courses and searches names and codes without accents', () => {
    const fixture = TestBed.createComponent(TeachingCoursesPage);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(request => request.url.endsWith('/session/users')).flush([{ id: '5', role: 'INSTRUCTOR' }]);
    fixture.detectChanges();
    http.expectOne(request => request.url.endsWith('/teaching/courses')).flush(Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: `Programación ${i}`, code: `PG-${i}`, startDate: null, endDate: null })));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.course-list li')).toHaveLength(8);
    const page = fixture.componentInstance;
    page.changePage(1); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.course-list li')).toHaveLength(2);
    page.searchCourses('programacion 9'); fixture.detectChanges();
    expect(page.visibleCourses().map(course => course.id)).toEqual(['9']);
    page.searchCourses('PG-1'); expect(page.visibleCourses().map(course => course.id)).toEqual(['1']);
    fixture.destroy();
  });
  it('cancels previous loads on identity changes and retries a failure', () => {
    const fixture = TestBed.createComponent(TeachingCoursesPage);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(request => request.url.endsWith('/session/users')).flush([{ id: '5', role: 'INSTRUCTOR' }, { id: '6', role: 'INSTRUCTOR' }]);
    fixture.detectChanges();
    const first = http.expectOne(request => request.url.endsWith('/teaching/courses'));
    TestBed.inject(SessionService).selectUser('6'); fixture.detectChanges();
    expect(first.cancelled).toBe(true);
    http.expectOne(request => request.url.endsWith('/teaching/courses')).flush({}, { status: 500, statusText: 'Error' }); fixture.detectChanges();
    fixture.componentInstance.reload(); fixture.detectChanges();
    http.expectOne(request => request.url.endsWith('/teaching/courses')).flush([]); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No tienes cursos publicados asignados');
    fixture.destroy();
  });
});
