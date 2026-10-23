import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { templateDefaults } from '../../core/certificate-template.service';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SessionService, SessionUser } from '../../core/session.service';
import { CertificateCandidate } from '../../core/certificate.service';
import { environment } from '../../../environments/environment';
import { approvedCandidate,certificateFixture,participantFixture } from '../../../testing/certificate-fixture';
import { CertificateEmissionPage } from './certificate-emission-page';

describe('CertificateEmissionPage', () => {
  let fixture: ComponentFixture<CertificateEmissionPage>; let http: HttpTestingController;
  const user = signal<SessionUser | null>({ ...participantFixture,id: '1',role: 'ADMIN' });
  const course = { id: '2',name: 'PostgreSQL',code: 'PG' };
  const failed: CertificateCandidate = { ...approvedCandidate,enrollmentId: '13',name: 'No aprobado',approvalStatus: 'REPROBADO',blockedReason: 'No cumple la nota mínima.' };
  const issued: CertificateCandidate = { ...approvedCandidate,enrollmentId: '14',name: 'Emitido',certificate: { id: '7',code: '8F72A91C',status: 'VALID' } };
  beforeEach(async () => {
    user.set({ ...participantFixture,id: '1',role: 'ADMIN' });
    await TestBed.configureTestingModule({ imports: [CertificateEmissionPage],providers: [provideRouter([]),provideHttpClient(),provideHttpClientTesting(),{ provide: SessionService,useValue: { currentUser: user } }] }).compileComponents();
    fixture = TestBed.createComponent(CertificateEmissionPage); http = TestBed.inject(HttpTestingController); fixture.detectChanges();
    http.expectOne(`${environment.apiBaseUrl}/certificates/courses`).flush([course]);
    http.expectOne(`${environment.apiBaseUrl}/certificate-templates`).flush([
      {id:'1',name:'Aprobación',type:'aprobacion',version:1,config:templateDefaults('aprobacion')},
      {id:'2',name:'Participación',type:'participacion',version:1,config:templateDefaults('participacion')}
    ]);
    fixture.componentInstance.selectCourse('2'); fixture.detectChanges();
    http.expectOne(`${environment.apiBaseUrl}/courses/2/certificates`).flush({ course,students: [approvedCandidate,failed,issued] }); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  it('enables approved unissued rows only and explains disabled actions', () => {
    const buttons = [...fixture.nativeElement.querySelectorAll('.roster button')] as HTMLButtonElement[];
    expect(buttons.map(button => button.disabled)).toEqual([false,true,true,false]);
    expect(buttons[1].title).toContain('nota mínima'); expect(buttons[2].title).toContain('ya fue emitido');
    expect(fixture.nativeElement.textContent).toContain('Aprobado'); expect(fixture.nativeElement.textContent).toContain('No aprobado');
  });
  it('requires confirmation, blocks double submits and shows server success', () => {
    const page = fixture.componentInstance; page.requestIssue(approvedCandidate); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Confirmar emisión'); http.expectNone(`${environment.apiBaseUrl}/certificates`);
    page.confirm(); page.confirm(); const request = http.expectOne(`${environment.apiBaseUrl}/certificates`);
    expect(page.saving()).toBe(true); request.flush(certificateFixture); fixture.detectChanges();
    http.expectOne(`${environment.apiBaseUrl}/courses/2/certificates`).flush({ course,students: [issued,failed] }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Certificado emitido correctamente'); expect(page.confirmation()).toBeNull();
  });
  it('requires a reason before revocation and reissues through the correction endpoint', () => {
    const page = fixture.componentInstance;
    page.requestRevocation(issued); page.confirmRevocation();
    http.expectNone(`${environment.apiBaseUrl}/certificates/7/revoke`);
    page.correctionReason.set('Corrección de asistencia'); page.confirmRevocation();
    const revoke = http.expectOne(`${environment.apiBaseUrl}/certificates/7/revoke`);
    expect(revoke.request.body).toEqual({reason:'Corrección de asistencia'});
    revoke.flush({...certificateFixture,status:'REVOKED'}); fixture.detectChanges();
    const revoked: CertificateCandidate = {...approvedCandidate, certificate:{id:'7',code:'8F72A91C',status:'REVOKED'}};
    http.expectOne(`${environment.apiBaseUrl}/courses/2/certificates`).flush({course,students:[revoked]}); fixture.detectChanges();
    expect(page.eligible()).toEqual([]);
    page.requestIssue(revoked); page.confirm(); http.expectNone(`${environment.apiBaseUrl}/certificates/7/reissue`);
    page.correctionReason.set('Asistencia corregida y revisada'); page.confirm();
    const reissue = http.expectOne(`${environment.apiBaseUrl}/certificates/7/reissue`);
    expect(reissue.request.body).toMatchObject({reason:'Asistencia corregida y revisada',type:'aprobacion',templateId:'1'});
    reissue.flush({...certificateFixture,id:'8',code:'ABCD1234'}); fixture.detectChanges();
    http.expectOne(`${environment.apiBaseUrl}/courses/2/certificates`).flush({course,students:[issued]});
  });
  it('keeps domain errors visible without falsely marking a certificate issued', () => {
    const page = fixture.componentInstance; page.requestIssue(approvedCandidate); page.confirm();
    http.expectOne(`${environment.apiBaseUrl}/certificates`).flush({ message: 'Ya se emitió un certificado.' },{ status: 409,statusText: 'Conflict' }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ya se emitió'); expect(page.students()[0].certificate).toBeNull(); expect(page.saving()).toBe(false);
  });
  it('emits only eligible participants in a bounded batch', () => {
    const page = fixture.componentInstance; page.requestBulk(); page.confirm();
    const request = http.expectOne(`${environment.apiBaseUrl}/courses/2/certificates/bulk`);
    expect(request.request.body).toEqual({ enrollmentIds: ['12'], templateId:'1' }); request.flush({ issued: [certificateFixture],failed: [] }); fixture.detectChanges();
    http.expectOne(`${environment.apiBaseUrl}/courses/2/certificates`).flush({ course,students: [issued] }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1 certificados emitidos');
  });
  it('cancels requests and clears private state when role changes', () => {
    user.set(participantFixture); fixture.detectChanges(); expect(fixture.componentInstance.students()).toEqual([]);
    expect(fixture.componentInstance.courses()).toEqual([]); http.expectNone(request => request.method==='POST');
  });
  it('loads participation eligibility and sends the selected type, cancelling stale confirmation', () => {
    const page = fixture.componentInstance;
    page.requestIssue(approvedCandidate);
    page.selectType('participacion'); fixture.detectChanges();
    expect(page.confirmation()).toBeNull(); expect(page.students()).toEqual([]);
    http.expectOne(`${environment.apiBaseUrl}/courses/2/certificates?type=participacion`).flush({ course, students: [approvedCandidate] }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Asistencia cumplida');
    page.requestIssue(approvedCandidate); page.confirm();
    const request = http.expectOne(`${environment.apiBaseUrl}/certificates`);
    expect(request.request.body).toEqual({ enrollmentId: approvedCandidate.enrollmentId, type: 'participacion', templateId:'2' });
    request.flush({ ...certificateFixture, type: 'participacion' }); fixture.detectChanges();
    http.expectOne(`${environment.apiBaseUrl}/courses/2/certificates?type=participacion`).flush({ course, students: [issued] }); fixture.detectChanges();
  });
});
