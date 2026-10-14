import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Subject } from 'rxjs';
import { InstructorService } from '../../core/instructor.service';
import { InstructorCreatePage } from './instructor-create-page';
import { SessionService } from '../../core/session.service';

describe('InstructorCreatePage', () => {
  let fixture: ComponentFixture<InstructorCreatePage>;
  let element: HTMLElement;
  const currentUser = signal<{ role: string } | null>({ role: 'ADMIN' });
  let response: Subject<any>;
  const create = vi.fn();
  const addInstructor = vi.fn();

  beforeEach(async () => {
    response = new Subject();
    create.mockReset().mockReturnValue(response);
    addInstructor.mockReset();
    currentUser.set({ role: 'ADMIN' });
    await TestBed.configureTestingModule({
      imports: [InstructorCreatePage],
      providers: [provideRouter([]), { provide: InstructorService, useValue: { create } }, { provide: SessionService, useValue: { currentUser, addInstructor } }]
    }).compileComponents();
    fixture = TestBed.createComponent(InstructorCreatePage);
    fixture.detectChanges();
    element = fixture.nativeElement;
  });

  function fill(id: string, value: string) {
    const input = element.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event(id === 'degree' ? 'change' : 'input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  function submit() {
    element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  it('shows required field errors and focuses the first invalid field', () => {
    submit();
    expect(element.querySelectorAll('[aria-invalid="true"]')).toHaveLength(7);
    expect(document.activeElement?.id).toBe('name');
    expect(element.textContent).toContain('Selecciona un grado');
    expect(element.textContent).toContain('El teléfono de contacto es obligatorio');
  });

  it('rejects invalid SIS codes and preserves a valid leading-zero code', () => {
    for (const code of ['12345678', '1234567890', '12345678a']) {
      fill('sis', code);
      expect(element.querySelector('#sis')?.getAttribute('aria-invalid')).toBe('true');
    }
    fill('sis', '001234567');
    expect(element.querySelector('#sis')?.getAttribute('aria-invalid')).toBe('false');
    expect(element.querySelector<HTMLInputElement>('#sis')?.value).toBe('001234567');
  });

  it('submits the contract, locks edits, then clears secrets and updates the directory', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation(() => {
      expect(fixture.componentInstance.form.pristine).toBe(true);
      expect(fixture.componentInstance.canLeave()).toBe(true);
      expect(fixture.componentInstance.form.getRawValue().password).toBe('');
      expect(fixture.componentInstance.form.getRawValue().confirmPassword).toBe('');
      return Promise.resolve(true);
    });
    fill('email', 'invalid');
    fill('phone', '---');
    expect(element.querySelector('#email')?.getAttribute('aria-invalid')).toBe('true');
    expect(element.querySelector('#phone')?.getAttribute('aria-invalid')).toBe('true');
    fill('name', 'Carla Mendoza');
    fill('degree', 'Ingeniero');
    fill('sis', '001234567');
    fill('email', 'carla@example.test');
    fill('phone', '+591 (700) 123-45');
    fill('password', ' 1234567890 ');
    fill('confirmPassword', ' 1234567890 ');
    submit();
    expect(create).toHaveBeenCalledWith({ name: 'Carla Mendoza', degree: 'Ingeniero', sis: '001234567', email: 'carla@example.test', phone: '+591 (700) 123-45', password: ' 1234567890 ' });
    expect(fixture.componentInstance.form.disabled).toBe(true);
    expect(element.querySelector<HTMLButtonElement>('[data-cancel]')!.disabled).toBe(true);
    fixture.componentInstance.cancel(); expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.canLeave()).toBe(false);
    submit(); expect(create).toHaveBeenCalledOnce();
    const instructor = { id: '42', name: 'Carla', role: 'INSTRUCTOR' };
    response.next(instructor); response.complete();
    expect(addInstructor).toHaveBeenCalledWith(instructor);
    expect(navigate).toHaveBeenCalledWith('/instructores', { state: { instructorCreated: 'Carla' } });
  });

  it('preserves the draft after network and field errors and supports retry', () => {
    fixture.componentInstance.form.setValue({ name: 'Carla', degree: 'Ingeniero', sis: '001234567', email: 'carla@example.test', phone: '700', password: 'long-password', confirmPassword: 'long-password' });
    fixture.componentInstance.form.markAsDirty(); submit(); response.error({ status: 0 }); fixture.detectChanges();
    expect(element.textContent).toContain('No se pudo conectar');
    expect(fixture.componentInstance.form.getRawValue().password).toBe('long-password');
    expect(fixture.componentInstance.form.enabled).toBe(true);
    response = new Subject(); create.mockReturnValue(response); submit();
    response.error({ status: 409, error: { message: 'Ya existe', fields: [{ path: 'sis', message: 'SIS duplicado' }] } }); fixture.detectChanges();
    expect(element.textContent).toContain('SIS duplicado'); expect(addInstructor).not.toHaveBeenCalled();
  });

  it('requires matching passwords of at least twelve characters', () => {
    fill('password', 'short'); fill('confirmPassword', 'other'); submit();
    expect(element.textContent).toContain('12 caracteres');
    expect(element.textContent).toContain('Las contraseñas deben coincidir');
    expect(create).not.toHaveBeenCalled();
  });

  it('focuses mismatched confirmation and provides accessible visibility controls', () => {
    fixture.componentInstance.form.setValue({ name: 'Carla', degree: 'Ingeniero', sis: '001234567', email: 'carla@example.test', phone: '700', password: 'long-password', confirmPassword: 'different-password' });
    submit(); expect(document.activeElement?.id).toBe('confirmPassword'); expect(create).not.toHaveBeenCalled();
    const toggle = element.querySelector<HTMLButtonElement>('[aria-controls="password"]')!;
    expect(toggle.textContent).toContain('Mostrar contraseña'); toggle.click(); fixture.detectChanges();
    expect(element.querySelector<HTMLInputElement>('#password')!.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('protects reload while dirty and stops protecting after logout', () => {
    fill('name', 'Carla');
    const event = { preventDefault: vi.fn(), returnValue: undefined } as unknown as BeforeUnloadEvent;
    fixture.componentInstance.beforeUnload(event); expect(event.preventDefault).toHaveBeenCalledOnce();
    currentUser.set(null); fixture.componentInstance.beforeUnload(event); expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('asks before discarding edits and respects the answer', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fill('name', 'Carla');
    element.querySelector<HTMLButtonElement>('[data-cancel]')!.click();
    expect(confirm).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    element.querySelector<HTMLButtonElement>('[data-cancel]')!.click();
    expect(navigate).toHaveBeenCalledWith('/instructores');
    confirm.mockRestore();
  });

  it('allows leaving after logout without blocking on the unsaved draft', () => {
    fill('name', 'Carla');
    currentUser.set(null);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(fixture.componentInstance.canLeave()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
