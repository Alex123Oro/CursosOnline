import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { CertificateService } from './certificate.service';
import { SessionService } from './session.service';
import { sessionInterceptor } from './session.interceptor';
import { environment } from '../../environments/environment';
import { certificateFixture } from '../../testing/certificate-fixture';

describe('CertificateService and public HTTP interception', () => {
  const endSessionLocally = vi.fn();
  beforeEach(() => {
    endSessionLocally.mockReset();
    TestBed.configureTestingModule({ providers: [provideRouter([]),provideHttpClient(withInterceptors([sessionInterceptor])),provideHttpClientTesting(),
      { provide: SessionService, useValue: { accessToken: () => 'token', userId: () => '9', endSessionLocally } }] });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('keeps public verification open if a separate authenticated request expires', () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/verificar/8F72A91C');
    const navigate = vi.spyOn(router,'navigateByUrl').mockResolvedValue(true);
    TestBed.inject(CertificateService).mine().subscribe({ error: () => {} });
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/certificates/me`)
      .flush({ message: 'Expired' }, { status: 401, statusText: 'Unauthorized' });
    expect(endSessionLocally).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
  it('verifies a normalized code without credentials and does not redirect on public 401', () => {
    const navigate = vi.spyOn(TestBed.inject(Router),'navigateByUrl').mockResolvedValue(true);
    TestBed.inject(CertificateService).verify(' 8f72a91c ').subscribe({ error: () => {} });
    const request = TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/certificates/verify/8F72A91C`);
    expect(request.request.headers.has('Authorization')).toBe(false); expect(request.request.headers.has('X-User-Id')).toBe(false);
    request.flush({ message: 'Gateway unauthorized' },{ status: 401,statusText: 'Unauthorized' });
    expect(navigate).not.toHaveBeenCalled(); expect(endSessionLocally).not.toHaveBeenCalled();
  });
  it('downloads as a private blob with Bearer credentials', () => {
    TestBed.inject(CertificateService).download('7').subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/certificates/me/7/pdf`);
    expect(request.request.responseType).toBe('blob'); expect(request.request.headers.get('Authorization')).toBe('Bearer token');
    request.flush(new Blob(['%PDF-1.7'],{ type: 'application/pdf' }));
  });
  it('does not send a participant ID when listing or issuing', () => {
    const api = TestBed.inject(CertificateService); const http = TestBed.inject(HttpTestingController);
    api.mine().subscribe(); const mine = http.expectOne(`${environment.apiBaseUrl}/certificates/me`);
    expect(mine.request.params.keys()).toEqual([]); mine.flush([]);
    api.issue('12').subscribe(); const issue = http.expectOne(`${environment.apiBaseUrl}/certificates`);
    expect(issue.request.body).toEqual({ enrollmentId: '12',type: 'aprobacion' }); issue.flush(certificateFixture);
  });
});
