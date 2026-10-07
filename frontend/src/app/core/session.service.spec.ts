import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SessionService, SessionUser } from './session.service';
import { sessionInterceptor } from './session.interceptor';
import { CoursesPage } from '../features/courses/courses-page/courses-page';
import { EnrollmentsPage } from '../features/enrollments/enrollments-page/enrollments-page';

const users: SessionUser[] = [
  { id: '4', name: 'Admin', email: 'admin@eva.local', role: 'ADMIN', participantTypeId: null, participantTypeName: null },
  { id: '8', name: 'Admin 2', email: 'admin2@eva.local', role: 'ADMIN', participantTypeId: null, participantTypeName: null }
];

describe('Administrative data and session startup', () => {
  beforeEach(() => {
    localStorage.removeItem('eva-user-id');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([sessionInterceptor])), provideHttpClientTesting()]
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.removeItem('eva-user-id');
  });
  it('keeps the initial users and all instructors, excludes demo students and preserves an instructor on reload', () => {
    localStorage.setItem('eva-user-id', '6');
    const session = TestBed.inject(SessionService);
    TestBed.inject(HttpTestingController).expectOne(request => request.url.endsWith('/session/users')).flush([
      ...Array.from({ length: 4 }, (_, i) => ({ id: String(i + 1), role: i === 0 ? 'ADMIN' : 'PARTICIPANT' })),
      { id: '5', role: 'INSTRUCTOR' }, { id: '6', role: 'INSTRUCTOR' }, { id: '7', role: 'PARTICIPANT' }
    ]);
    expect(session.sessionUsers().map(user => user.id)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(session.userId()).toBe('6');
    expect(session.ready()).toBe(true);
  });

  for (const [page, endpoint] of [[CoursesPage, '/courses'], [EnrollmentsPage, '/enrollments']] as const) {
    it(`waits for the session and reloads ${endpoint} on user changes`, () => {
      const session = TestBed.inject(SessionService);
      const http = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent<CoursesPage | EnrollmentsPage>(page);
      fixture.detectChanges();
      http.match(request => request.url.endsWith('/participant-types')).forEach(request => request.flush([]));
      http.expectNone(request => request.url.endsWith(endpoint));
      const discovery = http.expectOne(request => request.url.endsWith('/session/users'));
      expect(discovery.request.headers.has('X-User-Id')).toBe(false);
      discovery.flush(users);
      fixture.detectChanges();
      const first = http.expectOne(request => request.url.endsWith(endpoint));
      expect(first.request.headers.get('X-User-Id')).toBe('4');
      first.flush([]);
      session.selectUser('8');
      fixture.detectChanges();
      const second = http.expectOne(request => request.url.endsWith(endpoint));
      expect(second.request.headers.get('X-User-Id')).toBe('8');
      second.flush([]);
      fixture.destroy();
    });
  }
});
