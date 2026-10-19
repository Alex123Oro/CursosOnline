import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { CertificateVerificationPage } from './certificate-verification-page';

describe('CertificateVerificationPage', () => {
  let fixture: ComponentFixture<CertificateVerificationPage>; let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({}));
    await TestBed.configureTestingModule({ imports: [CertificateVerificationPage],providers: [provideRouter([]),provideHttpClient(),provideHttpClientTesting(),
      { provide: ActivatedRoute,useValue: { paramMap: params,snapshot: { paramMap: params.value } } }] }).compileComponents();
    fixture = TestBed.createComponent(CertificateVerificationPage); http = TestBed.inject(HttpTestingController); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  const open = (code = '8f72a91c') => { params.next(convertToParamMap({ codigo: code })); fixture.detectChanges(); };
  it('allows manual lookup without authentication or automatic requests', () => {
    expect(fixture.nativeElement.querySelector('input')).toBeTruthy(); expect(fixture.nativeElement.textContent).toContain('sin iniciar sesión');
    http.expectNone(request => request.url.includes('/certificates'));
  });
  it('displays only the public information for a valid certificate', async () => {
    open(); http.expectOne(`${environment.apiBaseUrl}/certificates/verify/8F72A91C`).flush({ status: 'VALID',code: '8F72A91C',message: 'Certificado válido',
      participantName: 'Ana Álvarez',courseName: 'PostgreSQL',durationHours: 40,type: 'aprobacion',issuedAt: '2026-10-01T12:00:00Z' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Certificado válido'); expect(fixture.nativeElement.textContent).toContain('Ana Álvarez');
    expect(fixture.nativeElement.textContent).toContain('40 horas'); expect(fixture.nativeElement.textContent).not.toContain('Correo');
  });
  it('shows nonexistent and annulled statuses without login', async () => {
    open(); http.expectOne(`${environment.apiBaseUrl}/certificates/verify/8F72A91C`).flush({ message: 'Not found' },{ status: 404,statusText: 'Not Found' });
    await fixture.whenStable(); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Certificado no válido o inexistente');
    open('11111111'); http.expectOne(`${environment.apiBaseUrl}/certificates/verify/11111111`).flush({ status: 'REVOKED',code: '11111111',message: 'Certificado anulado' });
    await fixture.whenStable(); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Certificado anulado');
    expect(fixture.nativeElement.textContent).not.toContain('Ana Álvarez');
  });
  it('does not request malformed codes', () => {
    open('INVALID'); expect(fixture.nativeElement.textContent).toContain('ocho caracteres hexadecimales');
    http.expectNone(request => request.url.includes('/certificates/verify/'));
  });
  it('displays the public rate-limiting message', async () => {
    open(); http.expectOne(`${environment.apiBaseUrl}/certificates/verify/8F72A91C`).flush({ message: 'Demasiadas verificaciones. Inténtalo más tarde.' },{ status: 429,statusText: 'Too Many Requests' });
    await fixture.whenStable(); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Demasiadas verificaciones');
  });
});
