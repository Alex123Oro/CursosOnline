import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { SessionService } from '../../core/session.service';
import { RegisterPage } from './register-page';

describe('RegisterPage', () => {
  let fixture: ComponentFixture<RegisterPage>;
  const register = vi.fn(), resendConfirmation = vi.fn();
  const fill = (values = {}) => fixture.componentInstance.form.setValue({ name: 'Ana Pérez', email: 'ana@est.umss.edu', participantKind: 'UMSS', password: 'strong-password', confirmPassword: 'strong-password', ...values });
  beforeEach(async () => {
    vi.resetAllMocks();
    await TestBed.configureTestingModule({ imports: [RegisterPage], providers: [provideRouter([]), { provide: SessionService, useValue: { register, resendConfirmation } }] }).compileComponents();
    fixture = TestBed.createComponent(RegisterPage); fixture.detectChanges();
  });
  it('requires confirmation and keeps the participant logged out after signup', () => {
    register.mockReturnValue(of({ message: 'Check email' })); fill();
    fixture.componentInstance.submit(); fixture.detectChanges();
    expect(register).toHaveBeenCalledWith({ name: 'Ana Pérez', email: 'ana@est.umss.edu', participantKind: 'UMSS', password: 'strong-password' });
    expect(fixture.nativeElement.textContent).toContain('Confirma tu correo');
    expect(fixture.componentInstance.form.controls.password.value).toBe('');
    expect(localStorage.getItem('eva-access-token')).toBeNull();
  });
  it.each(['ana@gmail.com', 'ana@umss.edu', 'ana@est.umss.edu.evil.test'])('rejects UMSS signup with %s', email => {
    fill({ email }); fixture.componentInstance.submit();
    expect(register).not.toHaveBeenCalled();
    expect(fixture.componentInstance.form.hasError('emailCategory')).toBe(true);
  });
  it('allows an external participant with personal email', () => {
    register.mockReturnValue(of({ message: 'Check email' })); fill({ email: 'ana@example.test', participantKind: 'EXTERNAL' });
    fixture.componentInstance.submit(); expect(register).toHaveBeenCalledWith(expect.objectContaining({ participantKind: 'EXTERNAL', email: 'ana@example.test' }));
  });
  it('rejects password mismatch before contacting the server', () => {
    fill({ confirmPassword: 'different' }); fixture.componentInstance.submit(); expect(register).not.toHaveBeenCalled();
  });
  it('allows recovery of an expired confirmation link without entering a password', () => {
    resendConfirmation.mockReturnValue(of({ message: 'Check email' }));
    fixture.componentInstance.resendForm.setValue({ email: 'ana@example.test' }); fixture.componentInstance.resend();
    expect(resendConfirmation).toHaveBeenCalledWith('ana@example.test'); expect(fixture.componentInstance.resent()).toBe(true);
  });
  it('shows a safe server error and allows retry', () => {
    register.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503, error: { message: 'Servicio no disponible.' } })));
    fill(); fixture.componentInstance.submit(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Servicio no disponible.'); expect(fixture.componentInstance.submitting()).toBe(false);
    expect(fixture.componentInstance.sentEmail()).toBe('');
  });
});
