import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { certificateFixture } from '../../../testing/certificate-fixture';
import { CertificateActions } from './certificate-actions';

describe('CertificateActions', () => {
  let fixture: ComponentFixture<CertificateActions>; let http: HttpTestingController;
  const writeText = vi.fn(); const createObjectURL = vi.fn(() => 'blob:test-pdf'); const revokeObjectURL = vi.fn();
  beforeEach(async () => {
    writeText.mockReset().mockResolvedValue(undefined); createObjectURL.mockClear(); revokeObjectURL.mockClear();
    Object.defineProperty(navigator,'clipboard',{ configurable: true,value: { writeText } });
    Object.defineProperty(URL,'createObjectURL',{ configurable: true,value: createObjectURL });
    Object.defineProperty(URL,'revokeObjectURL',{ configurable: true,value: revokeObjectURL });
    await TestBed.configureTestingModule({ imports: [CertificateActions],providers: [provideHttpClient(),provideHttpClientTesting()] }).compileComponents();
    fixture = TestBed.createComponent(CertificateActions); fixture.componentRef.setInput('certificate',certificateFixture);
    fixture.detectChanges(); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { fixture.destroy(); http.verify(); vi.restoreAllMocks(); });
  it('shares the exact verification link and confirms clipboard success', async () => {
    fixture.componentInstance.share(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input').value).toBe(certificateFixture.publicUrl);
    await fixture.componentInstance.copy(); fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith(certificateFixture.publicUrl); expect(fixture.nativeElement.textContent).toContain('Enlace copiado');
  });
  it('keeps the link available when clipboard permission fails', async () => {
    writeText.mockRejectedValue(new Error('Denied')); fixture.componentInstance.share(); await fixture.componentInstance.copy(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('cópialo manualmente'); expect(fixture.nativeElement.querySelector('input').value).toBe(certificateFixture.publicUrl);
  });
  it('downloads once, names the PDF and releases the object URL', () => {
    vi.useFakeTimers();
    const click = vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(() => {});
    const page = fixture.componentInstance; page.download(); page.download();
    const request = http.expectOne(`${environment.apiBaseUrl}/certificates/me/7/pdf`);
    expect(request.request.responseType).toBe('blob'); request.flush(new Blob(['%PDF'],{ type: 'application/pdf' }));
    expect(click).toHaveBeenCalledOnce(); expect(createObjectURL).toHaveBeenCalledOnce();
    vi.runAllTimers(); expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-pdf'); vi.useRealTimers();
  });
  it('reports a failed PDF download', () => {
    fixture.componentInstance.download(); http.expectOne(`${environment.apiBaseUrl}/certificates/me/7/pdf`).flush(null,{ status: 500,statusText: 'Error' });
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('No se pudo descargar');
  });
  it('does not download revoked certificates', () => {
    fixture.componentRef.setInput('certificate',{ ...certificateFixture,status: 'REVOKED' }); fixture.detectChanges();
    fixture.componentInstance.download(); http.expectNone(`${environment.apiBaseUrl}/certificates/me/7/pdf`);
    expect(fixture.nativeElement.textContent).not.toContain('Descargar PDF');
  });
});
