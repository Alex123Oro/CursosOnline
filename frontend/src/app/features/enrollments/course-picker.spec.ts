import { TestBed } from '@angular/core/testing';
import { EnrollmentCoursePicker } from './course-picker';

describe('course picker keyboard', () => {
  it('filters accents, selects with the keyboard and restores the selection on Escape', async () => {
    const fixture = TestBed.createComponent(EnrollmentCoursePicker);
    fixture.componentRef.setInput('courses', [
      {
        id: '7',
        name: 'Gestión ágil',
        code: 'GA-2026',
        status: 'DRAFT',
        capacity: 20,
        preenrolledCount: 2,
        enrolledCount: 1,
      },
      {
        id: '8',
        name: 'Scrum',
        code: 'S-2026',
        status: 'PUBLISHED',
        capacity: 20,
        preenrolledCount: 0,
        enrolledCount: 3,
      },
    ]);
    const chosen: string[] = [];
    fixture.componentInstance.changeCourse.subscribe((id) => {
      chosen.push(id);
      fixture.componentRef.setInput('value', id);
    });
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.dispatchEvent(new FocusEvent('focus'));
    input.value = 'gestion agil';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[role="option"]').length).toBe(1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(chosen).toEqual(['7']);
    expect(input.value).toContain('Gestión ágil');
    input.dispatchEvent(new FocusEvent('focus'));
    input.value = 'no existe';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay cursos que coincidan');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.value).toContain('Gestión ágil');
    input.dispatchEvent(new FocusEvent('focus'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    expect(input.getAttribute('aria-activedescendant')).toBe('course-option-8');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(chosen).toEqual(['7', '8']);
  });
});
