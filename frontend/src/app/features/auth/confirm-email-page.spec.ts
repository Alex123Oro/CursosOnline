import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { SessionService } from '../../core/session.service';
import { ConfirmEmailPage } from './confirm-email-page';

describe('ConfirmEmailPage', () => {
  const confirmEmail = vi.fn();
  beforeEach(async () => {
    confirmEmail.mockReset();
    await TestBed.configureTestingModule({ imports: [ConfirmEmailPage], providers: [provideRouter([]), { provide: SessionService, useValue: { confirmEmail } }] }).compileComponents();
  });
  afterEach(() => window.history.replaceState(null, '', '/'));
  it('removes tokens from the URL and shows only the backend verified category', () => {
    window.history.replaceState(null, '', '/confirmar-correo#access_token=verified-token&refresh_token=private-refresh');
    confirmEmail.mockImplementation(() => {
      expect(window.location.hash).toBe('');
      return of({ id: '1', name: 'Ana', participantTypeName: 'Estudiante', role: 'PARTICIPANT' });
    });
    const fixture = TestBed.createComponent(ConfirmEmailPage); fixture.detectChanges();
    expect(confirmEmail).toHaveBeenCalledWith('verified-token');
    expect(fixture.nativeElement.textContent).toContain('Estudiante UMSS');
    expect(window.location.href).not.toContain('private-refresh');
  });
  it('handles expired or reused links without granting a session', () => {
    window.history.replaceState(null, '', '/confirmar-correo#error=access_denied&error_code=otp_expired');
    const fixture = TestBed.createComponent(ConfirmEmailPage); fixture.detectChanges();
    expect(confirmEmail).not.toHaveBeenCalled(); expect(fixture.nativeElement.textContent).toContain('Solicitar otro enlace');
  });
  it('does not mark a rejected token as confirmed', () => {
    window.history.replaceState(null, '', '/confirmar-correo#access_token=fake');
    confirmEmail.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403, error: { message: 'Primero debes confirmar tu correo.' } })));
    const fixture = TestBed.createComponent(ConfirmEmailPage); fixture.detectChanges();
    expect(fixture.componentInstance.user()).toBeNull(); expect(fixture.nativeElement.textContent).toContain('Primero debes confirmar tu correo.');
  });
});
