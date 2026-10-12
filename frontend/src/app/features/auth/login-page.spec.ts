import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SessionService } from '../../core/session.service';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  const login = vi.fn();

  beforeEach(async () => {
    login.mockReset();
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideRouter([]), { provide: SessionService, useValue: { login } }]
    }).compileComponents();
    fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
  });

  it('sends valid credentials and navigates by the returned role', async () => {
    login.mockReturnValue(of({ id: '1', role: 'ADMIN' }));
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture.componentInstance.form.setValue({ email: 'admin@example.test', password: 'correct-password' });

    fixture.componentInstance.submit();
    await fixture.whenStable();

    expect(login).toHaveBeenCalledWith('admin@example.test', 'correct-password');
    expect(navigate).toHaveBeenCalledWith('/cursos');
  });

  it('shows rejected credential errors to the user', async () => {
    login.mockReturnValue(throwError(() => new HttpErrorResponse({ error: { message: 'Correo o contraseña incorrectos.' } })));
    fixture.componentInstance.form.setValue({ email: 'admin@example.test', password: 'wrong-password' });

    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Correo o contraseña incorrectos.');
  });
});