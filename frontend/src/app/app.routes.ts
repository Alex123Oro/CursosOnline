import { Routes } from '@angular/router';
import { CoursesWorkspace } from './features/courses/courses-workspace';
import { roleGuard } from './core/role.guard';
import { EnrollmentsPage } from './features/enrollments/enrollments-page/enrollments-page';
import { ParticipantCatalogPage } from './features/participant-catalog/participant-catalog-page/participant-catalog-page';
import { ParticipantCourseDetailPage } from './features/participant-catalog/participant-course-detail-page/participant-course-detail-page';
import { CourseSessionsPage } from './features/course-sessions/course-sessions-page';
import { AttendancePage } from './features/attendance/attendance-page';
import { InstructorAttendancePage } from './features/instructor-attendance/instructor-attendance-page';
import { AccountDirectoryPage } from './features/accounts/account-directory-page';
import { LoginPage } from './features/auth/login-page';
import { ProgressPage } from './features/progress/progress-page';

export const routes: Routes = [
  { path: 'iniciar-sesion', component: LoginPage, title: 'Iniciar sesión | EVA' },
  { path: 'mi-progreso', component: ProgressPage, canActivate: [roleGuard(['PARTICIPANT'])], title: 'Mi progreso | EVA' },
  { path: '', redirectTo: 'catalogo', pathMatch: 'full' },
  { path: 'cursos', component: CoursesWorkspace, canActivate: [roleGuard(['ADMIN', 'INSTRUCTOR'])], title: 'Cursos | EVA' },
  { path: 'cursos/:courseId/sesiones', component: CourseSessionsPage, canActivate: [roleGuard(['ADMIN', 'INSTRUCTOR'])], title: 'Sesiones del curso | EVA' },
  { path: 'cursos/:courseId/asistencia', component: AttendancePage, canActivate: [roleGuard(['ADMIN', 'INSTRUCTOR'])], title: 'Asistencia del curso | EVA' },
  { path: 'mis-cursos', redirectTo: 'cursos', pathMatch: 'full' },
  { path: 'inscripciones', component: EnrollmentsPage, canActivate: [roleGuard(['ADMIN'])], title: 'Inscripciones | EVA' },
  { path: 'usuarios', component: AccountDirectoryPage, canActivate: [roleGuard(['ADMIN'])], data: { directory: 'users' }, title: 'Usuarios | EVA' },
  { path: 'instructores', component: AccountDirectoryPage, canActivate: [roleGuard(['ADMIN'])], data: { directory: 'instructors' }, title: 'Instructores | EVA' },
  { path: 'asistencia-instructores', component: InstructorAttendancePage, canActivate: [roleGuard(['ADMIN'])], title: 'Asistencia de instructores | EVA' },
  { path: 'catalogo', component: ParticipantCatalogPage, title: 'Cursos disponibles | EVA' },
  { path: 'catalogo/:id', component: ParticipantCourseDetailPage, title: 'Detalle del curso | EVA' }
];
