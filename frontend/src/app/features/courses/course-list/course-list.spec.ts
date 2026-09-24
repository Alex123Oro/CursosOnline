import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Course } from '../../../core/course.service';
import { CourseList } from './course-list';

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
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CourseList] }).compileComponents();
    fixture = TestBed.createComponent(CourseList);
    component = fixture.componentInstance;
  });

  it('muestra los cursos recibidos después de iniciar con una lista vacía', () => {
    expect(component.filteredCourses()).toEqual([]);

    fixture.componentRef.setInput('courses', [course]);
    fixture.detectChanges();

    expect(component.filteredCourses()).toEqual([course]);
  });
});
