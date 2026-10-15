import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Course } from '../../../core/course.service';
import { CourseList } from './course-list';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

describe('CourseList', () => {
  let fixture: ComponentFixture<CourseList>;
  let component: CourseList;

  const course: Course = {
    id: '1',
    code: 'CUR-001',
    name: 'Curso de prueba',
    content: 'Contenido de prueba para el curso.',
    durationHours: 10,
    instructor: 'Docente de prueba',
    schedule: 'Lunes 10:00',
    approvalCriteria: 'Proyecto final',
    status: 'DRAFT',
    startDate: '2026-10-01',
    endDate: '2026-10-10',
    capacity: 10,
    preinscriptionStart: '2026-09-01',
    preinscriptionEnd: '2026-09-30',
    occupiedSlots: 0,
    remainingSlots: 10,
    prices: [],
    enrollment: null,
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CourseList], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(CourseList);
    component = fixture.componentInstance;
  });

  it('muestra los cursos recibidos después de iniciar con una lista vacía', () => {
    expect(component.filteredCourses()).toEqual([]);

    fixture.componentRef.setInput('courses', [course]);
    fixture.detectChanges();

    expect(component.filteredCourses()).toEqual([course]);
  });

  it('muestra el botón Publicar activo para cursos en borrador', () => {
    fixture.componentRef.setInput('courses', [course]);
    fixture.detectChanges();

    const publishButton = fixture.nativeElement.querySelector('button.publish') as HTMLButtonElement | null;

    expect(publishButton?.disabled).toBe(false);
    expect(getComputedStyle(publishButton!).cursor).toBe('pointer');
  });
  it('shows confirmed enrollment instead of the course schedule', () => {
    fixture.componentRef.setInput('courses', [{ ...course, enrolledCount: 3, occupiedSlots: 7 }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.enrollment-count')?.textContent).toContain('3');
    expect(fixture.nativeElement.textContent).not.toContain(course.schedule);
  });
  it('offers returning published courses to draft', () => {
    fixture.componentRef.setInput('courses', [{ ...course, status: 'PUBLISHED' }]); fixture.detectChanges();
    const emit = vi.spyOn(component.unpublishCourse, 'emit');
    const button = fixture.nativeElement.querySelector('button.unpublish') as HTMLButtonElement;
    expect(button?.textContent?.trim()).toBe('Volver a borrador');
    button.click(); expect(emit).toHaveBeenCalledWith(expect.objectContaining({ id: course.id }));
    fixture.componentRef.setInput('saving', true); fixture.detectChanges(); expect(button.disabled).toBe(true);
  });
  it('offers a classes link for drafts and published courses', () => {
    fixture.componentRef.setInput('courses', [course]); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a')?.getAttribute('href')).toBe('/cursos/1/sesiones');
    fixture.componentRef.setInput('courses', [{ ...course, status: 'PUBLISHED' }]); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a')?.getAttribute('href')).toBe('/cursos/1/sesiones');
  });
});
