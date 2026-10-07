import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { InstructorAttendancePage } from './instructor-attendance-page';
import { SessionService } from '../../core/session.service';
import { environment } from '../../../environments/environment';
const base = `${environment.apiBaseUrl}/admin`;
const users = [{ id: '1', name: 'Admin', role: 'ADMIN' }, { id: '8', name: 'Carla', role: 'INSTRUCTOR' }];
const row = { id: '3', date: '2026-10-06', startTime: '15:00', endTime: '16:00', editable: true, course: { id: '2', name: 'Curso', code: 'CUR' }, status: null, updatedAt: null, recordedById: null };
const data = { instructor: { id: '8', name: 'Carla' }, today: '2026-10-06', courses: [row.course], sessions: [row, { ...row, id: '4', date: '2026-10-07', editable: false }], summary: { present: 0, absent: 0, pending: 1 } };
describe('InstructorAttendancePage', () => {
  let fixture: ComponentFixture<InstructorAttendancePage>; let http: HttpTestingController;
  beforeEach(async () => {
    localStorage.removeItem('eva-user-id');
    await TestBed.configureTestingModule({ imports: [InstructorAttendancePage], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: ActivatedRoute, useValue: { queryParamMap: new BehaviorSubject(convertToParamMap({ instructor: '8', course: '2' })) } }] }).compileComponents();
    fixture = TestBed.createComponent(InstructorAttendancePage); http = TestBed.inject(HttpTestingController);
    http.expectOne(`${environment.apiBaseUrl}/session/users`).flush(users); fixture.detectChanges();
    http.expectOne(`${base}/instructors`).flush([{ id: '9', name: 'Diego' }, { id: '8', name: 'Carla' }]);
    http.expectOne(`${base}/instructors/8/attendance?courseId=2`).flush(data); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); localStorage.removeItem('eva-user-id'); });
  it('opens contextual instructor/course with no approval or percentage', () => {
    expect(fixture.componentInstance.instructorId()).toBe('8');
    expect(fixture.nativeElement.querySelector('#instructor').value).toBe('8');
    expect(fixture.nativeElement.textContent).toContain('1 pendiente');
    expect(fixture.nativeElement.textContent).not.toContain('%');
  });
  it('autosaves and corrects only after server confirmation', () => {
    const page = fixture.componentInstance; page.mark(page.sessions()[0], 'PRESENT'); page.mark(page.sessions()[0], 'ABSENT');
    expect(page.sessions()[0].status).toBe(null);
    const request = http.expectOne(`${base}/instructors/8/sessions/3/attendance`); expect(request.request.body).toEqual({status:'PRESENT'});
    request.flush({...row,status:'PRESENT'}); expect(page.summary().present).toBe(1);
    page.mark(page.sessions()[0],'ABSENT'); http.expectOne(`${base}/instructors/8/sessions/3/attendance`).flush({...row,status:'ABSENT'});
    expect(page.summary().absent).toBe(1); expect(page.summary().pending).toBe(0);
  });
  it('keeps old marks after failure and retries the intended choice', () => {
    const page=fixture.componentInstance; page.mark(page.sessions()[0],'ABSENT');
    http.expectOne(`${base}/instructors/8/sessions/3/attendance`).flush({message:'Falló el guardado'},{status:500,statusText:'Error'});
    expect(page.sessions()[0].status).toBe(null); expect(page.rowState()['3'].phase).toBe('error');
    page.retry(page.sessions()[0]); http.expectOne(`${base}/instructors/8/sessions/3/attendance`).flush({...row,status:'ABSENT'});
    expect(page.sessions()[0].status).toBe('ABSENT');
  });
  it('blocks future sessions and excludes them from pending', () => {
    const page=fixture.componentInstance; page.mark(page.sessions()[1],'PRESENT');
    http.expectNone(`${base}/instructors/8/sessions/4/attendance`); expect(page.summary().pending).toBe(1);
    page.setStateFilter('PENDING'); http.expectOne(`${base}/instructors/8/attendance?courseId=2`).flush(data);
    expect(page.filteredSessions()).toHaveLength(1);
  });
  it('cancels pending saves and clears data when another instructor is selected', () => {
    const page=fixture.componentInstance; page.mark(page.sessions()[0],'PRESENT'); const request=http.expectOne(`${base}/instructors/8/sessions/3/attendance`);
    page.selectInstructor('9'); expect(request.cancelled).toBe(false); expect(page.sessions()).toEqual([]);
    request.flush({...row,status:'PRESENT'}); expect(page.sessions()).toEqual([]);
    http.expectOne(`${base}/instructors/9/attendance`).flush({...data,instructor:{id:'9',name:'Diego'}});
  });
  it('sends inclusive date filters and clears outdated rows', () => {
    const page=fixture.componentInstance; page.setFilter('from','2026-10-01');
    http.expectOne(`${base}/instructors/8/attendance?courseId=2&from=2026-10-01`).flush(data);
    page.setFilter('to','2026-10-06'); http.expectOne(`${base}/instructors/8/attendance?courseId=2&from=2026-10-01&to=2026-10-06`).flush(data);
    page.setFilter('to','2026-09-30'); expect(page.sessions()).toEqual([]); expect(page.error()).toContain('Hasta');
  });
  it('denies instructor identities without requesting admin data', () => {
    TestBed.inject(SessionService).selectUser('8'); fixture.detectChanges();
    expect(fixture.componentInstance.sessions()).toEqual([]); expect(fixture.nativeElement.textContent).toContain('Solo el administrador');
    http.expectNone(`${base}/instructors`);
  });
  it('paginates eight rows and filters saved absences', () => {
    const page=fixture.componentInstance; page.sessions.set(Array.from({length:17},(_,i)=>({...row,id:String(i),status:i===16?'ABSENT' as const:null})));
    expect(page.visibleSessions()).toHaveLength(8); page.changePage(1); expect(page.visibleSessions()[0].id).toBe('8');
    const sessions=page.sessions(); page.setStateFilter('ABSENT'); http.expectOne(`${base}/instructors/8/attendance?courseId=2`).flush({...data,sessions});
    expect(page.visibleSessions()).toHaveLength(1); expect(page.visibleSessions()[0].id).toBe('16'); expect(page.summary().absent).toBe(1);
  });
  it('reconciles a save that finishes after filters changed and a stale read completed', () => {
    const page=fixture.componentInstance; page.mark(page.sessions()[0],'PRESENT'); const first=http.expectOne(`${base}/instructors/8/sessions/3/attendance`);
    page.setFilter('from','2026-10-01'); expect(first.cancelled).toBe(false);
    http.expectOne(`${base}/instructors/8/attendance?courseId=2&from=2026-10-01`).flush(data);
    first.flush({...row,status:'PRESENT'});
    http.expectOne(`${base}/instructors/8/attendance?courseId=2&from=2026-10-01`).flush({...data,sessions:[{...row,status:'PRESENT'}]});
    expect(page.sessions()[0].status).toBe('PRESENT');
  });
  it('ignores old write results after contextual navigation', () => {
    const page=fixture.componentInstance;
    page.mark(page.sessions()[0],'PRESENT'); const second=http.expectOne(`${base}/instructors/8/sessions/3/attendance`);
    (TestBed.inject(ActivatedRoute).queryParamMap as BehaviorSubject<ReturnType<typeof convertToParamMap>>).next(convertToParamMap({instructor:'9'})); fixture.detectChanges();
    expect(second.cancelled).toBe(false); expect(page.sessions()).toEqual([]);
    second.flush({...row,status:'PRESENT'}); expect(page.sessions()).toEqual([]);
    http.expectOne(`${base}/instructors`).flush([{id:'9',name:'Diego'}]); http.expectOne(`${base}/instructors/9/attendance`).flush({...data,instructor:{id:'9',name:'Diego'}});
  });
});
