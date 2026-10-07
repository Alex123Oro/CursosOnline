import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AttendancePage } from './attendance-page';
import { SessionService } from '../../core/session.service';
import type { AttendanceStudent } from '../../core/attendance.service';
import { environment } from '../../../environments/environment';
const base = environment.apiBaseUrl;
const users = [{ id: '1', name: 'Admin', role: 'ADMIN', email: '', participantTypeId: null }, { id: '8', name: 'Carla', role: 'INSTRUCTOR', email: '', participantTypeId: null }, { id: '10', name: 'Luis', role: 'PARTICIPANT', email: '', participantTypeId: null }];
const student: AttendanceStudent = { enrollmentId: '3', participantId: '10', name: 'Luis', percentage: 75, presentCount: 3, absentCount: 1, pendingCount: 2, attendance: [{ sessionId: '1', status: 'ABSENT', updatedAt: '' }] };
const data = { course: { id: '2', code: 'PG', name: 'PostgreSQL', instructor: 'Carla' }, today: '2026-10-06', sessions: [{ id: '1', date: '2026-10-06', startTime: '18:00', endTime: '19:00', editable: true }, { id: '2', date: '2026-10-07', startTime: '18:00', endTime: '19:00', editable: false }], students: [student] };
describe('AttendancePage', () => {
  let fixture: ComponentFixture<AttendancePage>; let http: HttpTestingController;
  beforeEach(async () => {
    localStorage.removeItem('eva-user-id');
    await TestBed.configureTestingModule({ imports: [AttendancePage], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ courseId: '2' })), queryParamMap: new BehaviorSubject(convertToParamMap({})) } }] }).compileComponents();
    fixture = TestBed.createComponent(AttendancePage); http = TestBed.inject(HttpTestingController);
    http.expectOne(`${base}/session/users`).flush(users); fixture.detectChanges();
    http.expectOne(`${base}/courses/2/attendance`).flush({ ...data, sessions: [{ ...data.sessions[0], id: 'older', date: '2026-10-05' }, ...data.sessions] }); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); localStorage.removeItem('eva-user-id'); });
  it('displays percentage, pending classes and the current local-day session', () => {
    expect(fixture.componentInstance.sessionId()).toBe('1');
    expect(fixture.nativeElement.textContent).toContain('75'); expect(fixture.nativeElement.textContent).toContain('2 pendientes');
  });
  it('keeps the visible selector aligned with a session selected after options load', () => {
    const page = fixture.componentInstance;
    page.reload();
    http.expectOne(`${base}/courses/2/attendance`).flush({ ...data, sessions: [{ ...data.sessions[0], id: 'older', date: '2026-10-05' }, ...data.sessions] });
    fixture.detectChanges();
    expect(page.sessionId()).toBe('1');
    expect(fixture.nativeElement.querySelector('select').value).toBe('1');
  });
  it('autosaves without optimistic success and prevents concurrent changes to the same student', () => {
    const page = fixture.componentInstance;
    page.mark(student, 'PRESENT'); page.mark(student, 'ABSENT');
    expect(page.statusFor(student)).toBe('ABSENT');
    const request = http.expectOne(`${base}/courses/2/sessions/1/attendance/3`);
    expect(request.request.method).toBe('PUT'); expect(request.request.body).toEqual({ status: 'PRESENT' });
    request.flush({ ...student, percentage: 100, attendance: [{ sessionId: '1', status: 'PRESENT', updatedAt: '' }] });
    expect(page.statusFor(page.students()[0])).toBe('PRESENT'); expect(page.rowState()['3'].phase).toBe('saved');
  });
  it('keeps the previous mark on failure and allows retrying the intended choice', () => {
    const page = fixture.componentInstance; page.mark(student, 'PRESENT');
    http.expectOne(`${base}/courses/2/sessions/1/attendance/3`).flush({ message: 'Error de conexión' }, { status: 500, statusText: 'Error' });
    expect(page.statusFor(student)).toBe('ABSENT'); expect(page.rowState()['3'].phase).toBe('error');
    page.retry(student);
    http.expectOne(`${base}/courses/2/sessions/1/attendance/3`).flush({ ...student, attendance: [{ sessionId: '1', status: 'PRESENT', updatedAt: '' }] });
    expect(page.statusFor(page.students()[0])).toBe('PRESENT');
  });
  it('disables future sessions even for direct method calls', () => {
    const page = fixture.componentInstance; page.selectSession('2');
    http.expectOne(`${base}/courses/2/attendance`).flush(data); fixture.detectChanges();
    page.mark(student, 'PRESENT'); http.expectNone(`${base}/courses/2/sessions/2/attendance/3`);
    expect(fixture.nativeElement.textContent).toContain('sesión futura');
  });
  it('clears and cancels pending changes on identity change', () => {
    const page = fixture.componentInstance; page.mark(student, 'PRESENT');
    const request = http.expectOne(`${base}/courses/2/sessions/1/attendance/3`);
    TestBed.inject(SessionService).selectUser('10'); fixture.detectChanges();
    expect(request.cancelled).toBe(true); expect(page.students()).toEqual([]);
    http.expectNone(`${base}/courses/2/attendance`);
  });
  it.each(['session', 'course', 'query'])('cancels pending saves when changing %s context', context => {
    const page = fixture.componentInstance; page.mark(student, 'PRESENT');
    const request = http.expectOne(`${base}/courses/2/sessions/1/attendance/3`);
    const route = TestBed.inject(ActivatedRoute);
    if (context === 'session') page.selectSession('2');
    if (context === 'course') (route.paramMap as BehaviorSubject<ReturnType<typeof convertToParamMap>>).next(convertToParamMap({ courseId: '5' }));
    if (context === 'query') (route.queryParamMap as BehaviorSubject<ReturnType<typeof convertToParamMap>>).next(convertToParamMap({ session: '2' }));
    fixture.detectChanges();
    expect(request.cancelled).toBe(true); expect(page.rowState()).toEqual({});
    http.expectOne(`${base}/courses/${context === 'course' ? '5' : '2'}/attendance`).flush(data);
    fixture.detectChanges();
    expect(page.sessionId()).toBe(context === 'course' ? '1' : '2');
  });
  it('paginates and searches the roster without discarding saved marks', () => {
    const page = fixture.componentInstance;
    page.students.set(Array.from({ length: 17 }, (_, i) => ({ ...student, enrollmentId: String(i), name: `Alumno ${i}` })));
    fixture.detectChanges(); expect(page.visibleStudents()).toHaveLength(8);
    page.changePage(1); expect(page.visibleStudents()[0].name).toBe('Alumno 8');
    page.setSearch('Alumno 16'); expect(page.visibleStudents()).toHaveLength(1); expect(page.visibleStudents()[0].name).toBe('Alumno 16');
  });
});
