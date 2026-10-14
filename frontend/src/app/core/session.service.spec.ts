import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SessionService, SessionUser } from './session.service';
import { environment } from '../../environments/environment';

const admin: SessionUser = { id: '1', name: 'Admin', email: 'admin@example.test', role: 'ADMIN', participantTypeId: null, participantTypeName: null };
const instructor: SessionUser = { id: '8', name: 'Carla', email: 'carla@example.test', role: 'INSTRUCTOR', participantTypeId: null, participantTypeName: null };

describe('SessionService authentication', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); localStorage.clear(); });

  it('restores the persisted authenticated instructor from the session endpoint', () => {
    localStorage.setItem('eva-access-token', 'persisted-token');
    localStorage.setItem('eva-user-id', instructor.id);
    localStorage.setItem('eva-user', JSON.stringify(instructor));
    const session = TestBed.inject(SessionService);
    TestBed.inject(HttpTestingController).expectOne(request => request.url.endsWith('/session/me')).flush(instructor);
    expect(session.currentUser()).toEqual(instructor);
    expect(session.ready()).toBe(true);
    expect(session.accessToken()).toBe('persisted-token');
    TestBed.inject(HttpTestingController).expectNone(request => request.url.endsWith('/session/users'));
  });

  it('logs in through credentials and loads the administration directory only for an admin', () => {
    const session = TestBed.inject(SessionService);
    const http = TestBed.inject(HttpTestingController);
    session.login(admin.email, 'secret').subscribe();
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({ accessToken: 'new-token', refreshToken: 'refresh', expiresAt: null, user: admin });
    expect(session.currentUser()).toEqual(admin);
    http.expectOne(request => request.url.endsWith('/session/users')).flush([admin, instructor]);
    session.selectUser(instructor.id);
    expect(session.currentUser()).toEqual(instructor);
    expect(session.accessToken()).toBe('');
  });

  it('clears local credentials on logout when there is no active token', () => {
    const session = TestBed.inject(SessionService);
    session.endSessionLocally();
    expect(session.currentUser()).toBeNull();
    expect(session.ready()).toBe(true);
    expect(localStorage.getItem('eva-access-token')).toBeNull();
  });

  it('adds an instructor to the local directory without persisting or changing the session', () => {
    const session = TestBed.inject(SessionService);
    const saved = localStorage.getItem('eva-user');
    session.addInstructor(instructor);
    expect(session.users()).toEqual([instructor]);
    expect(session.currentUser()).toBeNull();
    expect(localStorage.getItem('eva-user')).toBe(saved);
    session.addInstructor({ ...instructor, name: 'Updated' });
    expect(session.users()).toHaveLength(1);
  });
});
