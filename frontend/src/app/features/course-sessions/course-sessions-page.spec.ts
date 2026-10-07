import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { CourseSessionsPage } from './course-sessions-page';
import { SessionService } from '../../core/session.service';
import { environment } from '../../../environments/environment';

const base = environment.apiBaseUrl;
const users = [
  { id: '1', name: 'Admin', role: 'ADMIN', email: 'admin@test', participantTypeId: null, participantTypeName: null },
  { id: '8', name: 'Carla', role: 'INSTRUCTOR', email: 'carla@test', participantTypeId: null, participantTypeName: null },
  { id: '9', name: 'Luis', role: 'PARTICIPANT', email: 'luis@test', participantTypeId: null, participantTypeName: null }
];
const course = { id: '2', code: 'PG', name: 'PostgreSQL', instructor: 'Carla', instructorId: '8', startDate: '2026-10-12', endDate: '2026-11-12' };
const session = { id: '3', courseId: '2', date: '2026-10-11', startTime: '19:00', durationMinutes: 120, endTime: '21:00', warning: 'Fuera del periodo', createdAt: '', updatedAt: '' };
describe('CourseSessionsPage', () => {
  let fixture: ComponentFixture<CourseSessionsPage>;
  let http: HttpTestingController;
  beforeEach(async () => {
    localStorage.removeItem('eva-user-id');
    await TestBed.configureTestingModule({ imports: [CourseSessionsPage], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: ActivatedRoute, useValue: { paramMap: new (await import('rxjs')).BehaviorSubject(convertToParamMap({ courseId: '2' })) } }] }).compileComponents();
    fixture = TestBed.createComponent(CourseSessionsPage);
    http = TestBed.inject(HttpTestingController);
    http.expectOne(`${base}/session/users`).flush(users);
    fixture.detectChanges();
    http.expectOne(`${base}/courses/2/sessions`).flush({ course, sessions: [session] });
    fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); localStorage.removeItem('eva-user-id'); });
  it('renders existing sessions and their period warnings', () => {
    expect(fixture.nativeElement.textContent).toContain('PostgreSQL');
    expect(fixture.nativeElement.textContent).toContain('21:00');
    expect(fixture.nativeElement.textContent).toContain('Fuera del periodo');
  });
  it('offers the instructor attendance link only to administrators', () => {
    const link = fixture.nativeElement.querySelector('a[href^="/asistencia-instructores"]');
    expect(link?.getAttribute('href')).toContain('instructor=8');
    expect(link?.getAttribute('href')).toContain('course=2');
    TestBed.inject(SessionService).selectUser('8'); fixture.detectChanges();
    http.expectOne(`${base}/courses/2/sessions`).flush({ course, sessions: [session] }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href^="/asistencia-instructores"]')).toBe(null);
  });
  it('shows six compact rows per page and reaches the last class without a long list', () => {
    const page = fixture.componentInstance;
    page.sessions.set(Array.from({ length: 21 }, (_, index) => ({ ...session, id: String(index + 1), date: `2026-10-${String(index + 1).padStart(2, '0')}`, warning: null })));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.agenda-row')).toHaveLength(6);
    expect(fixture.nativeElement.textContent).not.toContain('Dentro del periodo');
    expect(fixture.nativeElement.textContent).not.toContain('120 minutos de clase');
    page.changePage(1); fixture.detectChanges();
    expect(page.visibleSessions()[0].date).toBe('2026-10-07');
    page.changePage(1); page.changePage(1); page.changePage(1); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.agenda-row')).toHaveLength(3);
    expect(page.visibleSessions().at(-1)?.date).toBe('2026-10-21');
    expect(fixture.nativeElement.querySelector('button[aria-label="Página siguiente"]').disabled).toBe(true);
    page.changePage(-1); expect(page.visibleSessions()[0].date).toBe('2026-10-13');
  });
  it('previews weekdays, includes the end date and distinguishes existing sessions', () => {
    const page = fixture.componentInstance;
    page.openSchedule();
    page.scheduleForm.setValue({ startDate: '2026-10-11', endDate: '2026-10-21', weekdays: [0, 1, 3], startTime: '19:00', durationMinutes: 120 });
    expect(page.preview().map(row => row.date)).toEqual(['2026-10-11', '2026-10-12', '2026-10-14', '2026-10-18', '2026-10-19', '2026-10-21']);
    expect(page.preview()[0]).toMatchObject({ duplicate: true, outside: true });
    expect(page.newCount()).toBe(5);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Vista previa');
  });
  it('submits a weekly batch only once and replaces the agenda with persisted sessions', () => {
    const page = fixture.componentInstance;
    page.openSchedule();
    page.scheduleForm.setValue({ startDate: '2026-10-12', endDate: '2026-10-21', weekdays: [1, 3], startTime: '18:00', durationMinutes: 90 });
    page.submitSchedule(); page.submitSchedule();
    const request = http.expectOne(`${base}/courses/2/sessions/schedule`);
    expect(request.request.body.weekdays).toEqual([1, 3]);
    request.flush({ createdCount: 3, skippedCount: 1, sessions: [session, { ...session, id: '4', date: '2026-10-12' }] });
    expect(page.sessions()).toHaveLength(2);
    expect(page.formOpen()).toBe(false);
    expect(page.feedback()).toContain('3');
    expect(page.feedback()).toContain('1');
  });
  it('preserves a failed batch and prevents invalid date ranges from sending requests', () => {
    const page = fixture.componentInstance;
    page.openSchedule();
    page.scheduleForm.setValue({ startDate: '2026-10-12', endDate: '2026-10-01', weekdays: [1], startTime: '18:00', durationMinutes: 90 });
    page.submitSchedule(); http.expectNone(`${base}/courses/2/sessions/schedule`);
    page.scheduleForm.controls.endDate.setValue('2026-10-21');
    page.submitSchedule();
    http.expectOne(`${base}/courses/2/sessions/schedule`).flush({ message: 'Intenta nuevamente' }, { status: 500, statusText: 'Error' });
    expect(page.formOpen()).toBe(true); expect(page.scheduleForm.controls.weekdays.value).toEqual([1]);
    expect(page.saving()).toBe(false);
  });
  it('preserves the form on duplicate error and prevents concurrent submits', () => {
    const page = fixture.componentInstance;
    page.openCreate();
    page.form.setValue({ date: '2026-10-11', startTime: '19:00', durationMinutes: 120 });
    expect(page.formWarning()).toBeTruthy();
    page.submit(); page.submit();
    const request = http.expectOne(`${base}/courses/2/sessions`);
    expect(request.request.method).toBe('POST');
    request.flush({ message: 'Ya existe una sesión.' }, { status: 409, statusText: 'Conflict' });
    expect(page.formOpen()).toBe(true);
    expect(page.form.getRawValue().date).toBe('2026-10-11');
    expect(page.feedback()).toContain('Ya existe');
  });
  it('edits the existing session rather than creating a new one', () => {
    const page = fixture.componentInstance;
    page.openEdit(session); page.form.controls.startTime.setValue('18:00'); page.submit();
    const request = http.expectOne(`${base}/courses/2/sessions/3`);
    expect(request.request.method).toBe('PUT');
    request.flush({ ...session, startTime: '18:00', endTime: '20:00' });
    expect(page.sessions()).toHaveLength(1);
    expect(page.sessions()[0].startTime).toBe('18:00');
  });
  it('clears the form and rows on identity change and respects a 403', () => {
    const page = fixture.componentInstance;
    page.openEdit(session);
    TestBed.inject(SessionService).selectUser('8'); fixture.detectChanges();
    expect(page.sessions()).toEqual([]); expect(page.formOpen()).toBe(false);
    http.expectOne(`${base}/courses/2/sessions`).flush({ message: 'Sin acceso' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(page.course()).toBeNull(); expect(fixture.nativeElement.textContent).toContain('Sin acceso');
    expect(fixture.nativeElement.querySelector('button.add-session')).toBeNull();
  });
  it('clears administrative data and denies a participant without fetching sessions', () => {
    TestBed.inject(SessionService).selectUser('9'); fixture.detectChanges();
    http.expectNone(`${base}/courses/2/sessions`);
    expect(fixture.componentInstance.sessions()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('No tienes permisos');
  });
});
