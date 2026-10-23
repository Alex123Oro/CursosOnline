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

  it('keeps signup unauthenticated until the confirmation endpoint verifies the token', () => {
    const session = TestBed.inject(SessionService);
    const http = TestBed.inject(HttpTestingController);
    session.register({ name: 'Ana', email: 'ana@example.test', password: 'strong-password', participantKind: 'EXTERNAL' }).subscribe();
    http.expectOne(`${environment.apiBaseUrl}/auth/register`).flush({ message: 'Check email' });
    expect(session.currentUser()).toBeNull();
    expect(localStorage.getItem('eva-access-token')).toBeNull();
    session.confirmEmail('verified-token').subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/auth/confirm-email`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer verified-token');
    const participant = { ...instructor, role: 'PARTICIPANT', participantTypeId: '4', participantTypeName: 'Externo' };
    request.flush({ accessToken: 'verified-token', user: participant });
    expect(session.currentUser()).toEqual(participant);
    expect(localStorage.getItem('eva-access-token')).toBe('verified-token');
  });

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
    expect(session.currentUser()).toEqual(admin);
    expect(session.accessToken()).toBe('new-token');
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

  function persisted() {
    localStorage.setItem('eva-access-token','old'); localStorage.setItem('eva-refresh-token','refresh-old');
    localStorage.setItem('eva-user-id',instructor.id); localStorage.setItem('eva-user',JSON.stringify(instructor));
    return {session: TestBed.inject(SessionService),http:TestBed.inject(HttpTestingController)};
  }
  it('preserves the cached session during a temporary restoration failure and allows retry', () => {
    const {session,http} = persisted();
    http.expectOne(req => req.url.endsWith('/session/me')).flush({}, {status:503,statusText:'Unavailable'});
    expect(session.currentUser()).toEqual(instructor); expect(session.accessToken()).toBe('old'); expect(session.ready()).toBe(true);
    expect(session.connectionIssue()).not.toBe('');
    session.retryConnection(); http.expectOne(req => req.url.endsWith('/session/me')).flush(instructor);
    expect(session.connectionIssue()).toBe('');
  });
  it('renews an expired session and restores it with the rotated token', () => {
    const {session,http} = persisted();
    http.expectOne(req => req.url.endsWith('/session/me')).flush({}, {status:401,statusText:'Unauthorized'});
    const refresh = http.expectOne(req => req.url.endsWith('/auth/refresh'));
    expect(refresh.request.body).toEqual({refreshToken:'refresh-old'});
    refresh.flush({accessToken:'new',refreshToken:'refresh-new',expiresAt:null,user:instructor});
    const me = http.expectOne(req => req.url.endsWith('/session/me')); expect(me.request.headers.get('Authorization')).toBe('Bearer new'); me.flush(instructor);
    expect(session.accessToken()).toBe('new'); expect(localStorage.getItem('eva-refresh-token')).toBe('refresh-new');
  });
  it('shares a renewal across concurrent callers', () => {
    const {session,http} = persisted(); http.expectOne(req => req.url.endsWith('/session/me')).flush(instructor);
    const a = vi.fn(), b = vi.fn(); session.renewSession().subscribe(a); session.renewSession().subscribe(b);
    http.expectOne(req => req.url.endsWith('/auth/refresh')).flush({accessToken:'new',refreshToken:'rotated',expiresAt:null,user:instructor});
    expect(a).toHaveBeenCalledWith('new'); expect(b).toHaveBeenCalledWith('new');
  });
  it('retains refresh credentials during a temporary renewal failure', () => {
    const {session,http} = persisted(); http.expectOne(req => req.url.endsWith('/session/me')).flush(instructor);
    session.renewSession().subscribe({error:()=>{}});
    http.expectOne(req => req.url.endsWith('/auth/refresh')).flush({}, {status:503,statusText:'Unavailable'});
    expect(session.accessToken()).toBe('old'); expect(localStorage.getItem('eva-refresh-token')).toBe('refresh-old');
  });
  it('removes both credentials if the refresh token has been revoked', () => {
    const {session,http} = persisted(); http.expectOne(req => req.url.endsWith('/session/me')).flush(instructor);
    session.renewSession().subscribe({error:()=>{}});
    http.expectOne(req => req.url.endsWith('/auth/refresh')).flush({}, {status:401,statusText:'Unauthorized'});
    expect(session.accessToken()).toBe(''); expect(localStorage.getItem('eva-refresh-token')).toBeNull();
  });
  it('does not resurrect a logged out profile when restoration completes late', () => {
    const {session,http} = persisted(); const pending = http.expectOne(req => req.url.endsWith('/session/me'));
    session.endSessionLocally(); pending.flush(instructor);
    expect(session.currentUser()).toBeNull(); expect(localStorage.getItem('eva-user')).toBeNull();
  });
  it('does not clear a newly logged in account when an older logout completes', () => {
    const {session,http} = persisted(); http.expectOne(req => req.url.endsWith('/session/me')).flush(instructor);
    session.logout().subscribe(); const pending = http.expectOne(req => req.url.endsWith('/auth/logout'));
    session.login(instructor.email,'secret').subscribe(); http.expectOne(req => req.url.endsWith('/auth/login')).flush({accessToken:'new',refreshToken:'new-refresh',expiresAt:null,user:instructor});
    pending.flush(null); expect(session.accessToken()).toBe('new');
  });
});
