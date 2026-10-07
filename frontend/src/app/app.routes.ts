import { Routes } from '@angular/router';
import { CoursesPage } from './features/courses/courses-page/courses-page';
import { EnrollmentsPage } from './features/enrollments/enrollments-page/enrollments-page';
import { ParticipantCatalogPage } from './features/participant-catalog/participant-catalog-page/participant-catalog-page';
import { ParticipantCourseDetailPage } from './features/participant-catalog/participant-course-detail-page/participant-course-detail-page';
import { CourseSessionsPage } from './features/course-sessions/course-sessions-page';
import { TeachingCoursesPage } from './features/course-sessions/teaching-courses-page';
import { AttendancePage } from './features/attendance/attendance-page';
import { InstructorAttendancePage } from './features/instructor-attendance/instructor-attendance-page';

export const routes: Routes = [
  { path: '', redirectTo: 'cursos', pathMatch: 'full' },
  { path: 'cursos', component: CoursesPage, title: 'Administración de cursos | EVA' },
  { path: 'cursos/:courseId/sesiones', component: CourseSessionsPage, title: 'Sesiones del curso | EVA' },
  { path: 'cursos/:courseId/asistencia', component: AttendancePage, title: 'Asistencia del curso | EVA' },
  { path: 'mis-cursos', component: TeachingCoursesPage, title: 'Mis cursos | EVA' },
  { path: 'inscripciones', component: EnrollmentsPage, title: 'Inscripciones | EVA' },
  { path: 'asistencia-instructores', component: InstructorAttendancePage, title: 'Asistencia de instructores | EVA' },
  { path: 'catalogo', component: ParticipantCatalogPage, title: 'Cursos disponibles | EVA' },
  { path: 'catalogo/:id', component: ParticipantCourseDetailPage, title: 'Detalle del curso | EVA' }
];
