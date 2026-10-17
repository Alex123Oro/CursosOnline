import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../environments/environment';
import { SessionService, SessionUser } from '../app/core/session.service';

export const fixtureUsers: SessionUser[] = [
  { id: '1', name: 'Admin', email: 'admin@test', role: 'ADMIN', participantTypeId: null, participantTypeName: null },
  { id: '4', name: 'Admin 2', email: 'admin2@test', role: 'ADMIN', participantTypeId: null, participantTypeName: null },
  { id: '8', name: 'Carla', email: 'carla@test', role: 'INSTRUCTOR', participantTypeId: null, participantTypeName: null },
  { id: '5', name: 'Instructor 2', email: 'instructor2@test', role: 'INSTRUCTOR', participantTypeId: null, participantTypeName: null },
  { id: '6', name: 'Instructor 3', email: 'instructor3@test', role: 'INSTRUCTOR', participantTypeId: null, participantTypeName: null },
  { id: '9', name: 'Luis', email: 'luis@test', role: 'PARTICIPANT', participantTypeId: '1', participantTypeName: 'Estudiante' },
  { id: '10', name: 'Ana', email: 'ana@test', role: 'PARTICIPANT', participantTypeId: '1', participantTypeName: 'Estudiante' },
  { id: '3', name: 'Participante 3', email: 'p3@test', role: 'PARTICIPANT', participantTypeId: '1', participantTypeName: 'Estudiante' }
];

export const authenticateAdminFixture = (http: HttpTestingController) => {
  localStorage.removeItem('eva-user-id');
  localStorage.setItem('eva-access-token', 'fixture-access-token');
  localStorage.setItem('eva-user', JSON.stringify(fixtureUsers[0]));
  const session = TestBed.inject(SessionService);
  http.expectOne(`${environment.apiBaseUrl}/session/me`).flush(fixtureUsers[0]);
  http.expectOne(`${environment.apiBaseUrl}/session/users`).flush(fixtureUsers);
  return session;
};

export const clearFixtureSession = () => {
  localStorage.removeItem('eva-user-id');
  localStorage.removeItem('eva-user');
  localStorage.removeItem('eva-access-token');
  localStorage.removeItem('eva-logged-out');
};

export const selectFixtureUser = (session: SessionService, id: string) => {
  const user = session.users().find(item => item.id === id) ?? fixtureUsers.find(item => item.id === id);
  if (!user) throw new Error('Unknown fixture user');
  session.login(user.email, 'test-only-password').subscribe();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({ user, accessToken: 'fixture-access-token', refreshToken: '', expiresAt: null });
  if (user.role === 'ADMIN') http.expectOne(`${environment.apiBaseUrl}/session/users`).flush(fixtureUsers);
  else for (const other of fixtureUsers.filter(item => item.id !== id)) session.addInstructor(other);
};
