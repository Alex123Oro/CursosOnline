import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { InstructorCreatePage } from './instructor-create-page';
import { SessionService } from '../../core/session.service';

describe('InstructorCreatePage', () => {
  let fixture: ComponentFixture<InstructorCreatePage>;
  let element: HTMLElement;
  const currentUser = signal<{ role: string } | null>({ role: 'ADMIN' });

  beforeEach(async () => {
    currentUser.set({ role: 'ADMIN' });
    await TestBed.configureTestingModule({
      imports: [InstructorCreatePage],
      providers: [provideRouter([]), { provide: SessionService, useValue: { currentUser } }]
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
    expect(element.querySelectorAll('[aria-invalid="true"]')).toHaveLength(5);
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

  it('validates contact information and only announces preview validation', () => {
    fill('email', 'invalid');
    fill('phone', '---');
    expect(element.querySelector('#email')?.getAttribute('aria-invalid')).toBe('true');
    expect(element.querySelector('#phone')?.getAttribute('aria-invalid')).toBe('true');
    fill('name', 'Carla Mendoza');
    fill('degree', 'Ingeniero');
    fill('sis', '001234567');
    fill('email', 'carla@example.test');
    fill('phone', '+591 (700) 123-45');
    submit();
    expect(element.textContent).toContain('Datos completos. El registro estará disponible cuando se conecte el servicio');
    fill('name', 'Carla');
    expect(element.textContent).not.toContain('Datos completos.');
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
