import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { InstructorService } from './instructor.service';
import { SessionService } from './session.service';
import { sessionInterceptor } from './session.interceptor';
import { environment } from '../../environments/environment';

describe('InstructorService', () => {
  const endSessionLocally = vi.fn();
  beforeEach(() => {
    endSessionLocally.mockReset();
    TestBed.configureTestingModule({ providers: [
      provideRouter([]), provideHttpClient(withInterceptors([sessionInterceptor])), provideHttpClientTesting(),
      { provide: SessionService, useValue: { accessToken: () => 'admin-token', userId: () => '1', endSessionLocally } }
    ] });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('posts the instructor through the authenticated HTTP interceptor', () => {
    const payload = { name: 'Carla', email: 'carla@example.test', sis: '001234567', degree: 'Ingeniero' as const, phone: '700', password: ' 1234567890 ' };
    TestBed.inject(InstructorService).create(payload).subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/admin/instructors`);
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual(payload);
    expect(request.request.headers.get('Authorization')).toBe('Bearer admin-token');
    request.flush({ id: '42', name: 'Carla', role: 'INSTRUCTOR' });
  });

  it('expires the session and navigates to login on an unauthorized response', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const error = vi.fn();
    TestBed.inject(InstructorService).create({ name: 'Carla', email: 'carla@example.test', sis: '001234567', degree: 'Ingeniero', phone: '700', password: 'long-password' }).subscribe({ error });
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/admin/instructors`).flush({ message: 'Expired' }, { status: 401, statusText: 'Unauthorized' });
    expect(endSessionLocally).toHaveBeenCalledOnce(); expect(navigate).toHaveBeenCalledWith('/iniciar-sesion');
    expect(error).toHaveBeenCalledOnce();
  });
});
