import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SessionService, SessionUser } from '../../core/session.service';
import { environment } from '../../../environments/environment';
import { certificateFixture, participantFixture } from '../../../testing/certificate-fixture';
import { MyCertificatesPage } from './my-certificates-page';

describe('MyCertificatesPage', () => {
  let fixture: ComponentFixture<MyCertificatesPage>; let http: HttpTestingController;
  const user = signal<SessionUser | null>(participantFixture);
  beforeEach(async () => {
    user.set(participantFixture);
    await TestBed.configureTestingModule({ imports: [MyCertificatesPage],providers: [provideRouter([]),provideHttpClient(),provideHttpClientTesting(),{ provide: SessionService,useValue: { currentUser: user } }] }).compileComponents();
    fixture = TestBed.createComponent(MyCertificatesPage); http = TestBed.inject(HttpTestingController); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  it('shows the empty history and no download option', async () => {
    http.expectOne(`${environment.apiBaseUrl}/certificates/me`).flush([]); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aún no tienes certificados');
    expect(fixture.nativeElement.textContent).not.toContain('Descargar PDF');
  });
  it('shows course, issue date, code, badge, detail and actions', async () => {
    http.expectOne(`${environment.apiBaseUrl}/certificates/me`).flush([certificateFixture]); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('PostgreSQL'); expect(fixture.nativeElement.textContent).toContain('8F72A91C');
    expect(fixture.nativeElement.textContent).toContain('Vigente'); expect(fixture.nativeElement.textContent).toContain('Descargar PDF');
    expect(fixture.nativeElement.querySelector('a[href="/mis-certificados/7"]')).toBeTruthy();
  });
  it('shows revoked records but hides download', async () => {
    http.expectOne(`${environment.apiBaseUrl}/certificates/me`).flush([{ ...certificateFixture,status: 'REVOKED' }]); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Anulado'); expect(fixture.nativeElement.textContent).not.toContain('Descargar PDF');
  });
  it('clears private records when the identity changes', async () => {
    http.expectOne(`${environment.apiBaseUrl}/certificates/me`).flush([certificateFixture]); await fixture.whenStable(); fixture.detectChanges();
    user.set(null); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.items()).toEqual([]); expect(fixture.nativeElement.textContent).not.toContain('Ana Álvarez');
  });
});
