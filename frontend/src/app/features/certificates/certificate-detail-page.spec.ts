import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SessionService } from '../../core/session.service';
import { environment } from '../../../environments/environment';
import { certificateFixture, participantFixture } from '../../../testing/certificate-fixture';
import { CertificateDetailPage } from './certificate-detail-page';

describe('CertificateDetailPage', () => {
  let fixture: ComponentFixture<CertificateDetailPage>; let http: HttpTestingController;
  beforeEach(async () => {
    const params = new BehaviorSubject(convertToParamMap({ id: '7' }));
    await TestBed.configureTestingModule({ imports: [CertificateDetailPage],providers: [provideRouter([]),provideHttpClient(),provideHttpClientTesting(),
      { provide: SessionService,useValue: { currentUser: signal(participantFixture) } },
      { provide: ActivatedRoute,useValue: { paramMap: params,snapshot: { paramMap: params.value } } }] }).compileComponents();
    fixture = TestBed.createComponent(CertificateDetailPage); http = TestBed.inject(HttpTestingController); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  it('renders the private detail and sharing/download actions', async () => {
    http.expectOne(`${environment.apiBaseUrl}/certificates/me/7`).flush(certificateFixture); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ana Álvarez'); expect(fixture.nativeElement.textContent).toContain('40 horas');
    expect(fixture.nativeElement.textContent).toContain('Aprobación'); expect(fixture.nativeElement.textContent).toContain('Compartir');
  });
  it('does not render another participant certificate when the API returns 404', async () => {
    http.expectOne(`${environment.apiBaseUrl}/certificates/me/7`).flush({ message: 'Certificado no encontrado.' },{ status: 404,statusText: 'Not Found' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Certificado no encontrado.');
    expect(fixture.nativeElement.textContent).not.toContain('Descargar PDF'); expect(fixture.componentInstance.item()).toBeNull();
  });
});
