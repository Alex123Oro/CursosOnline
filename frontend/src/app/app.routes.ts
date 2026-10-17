import { Routes } from '@angular/router';
import { CoursesWorkspace } from './features/courses/courses-workspace';
import { CoursesPage } from './features/courses/courses-page/courses-page';
import { roleGuard } from './core/role.guard';
import { EnrollmentsPage } from './features/enrollments/enrollments-page/enrollments-page';
import { EnrollmentDetailPage } from './features/enrollments/enrollment-detail-page/enrollment-detail-page';
import { ParticipantCatalogPage } from './features/participant-catalog/participant-catalog-page/participant-catalog-page';
import { ParticipantCourseDetailPage } from './features/participant-catalog/participant-course-detail-page/participant-course-detail-page';
import { CourseSessionsPage } from './features/course-sessions/course-sessions-page';
import { AttendancePage } from './features/attendance/attendance-page';
import { InstructorAttendancePage } from './features/instructor-attendance/instructor-attendance-page';
import { AccountDirectoryPage } from './features/accounts/account-directory-page';
import { InstructorCreatePage, instructorDraftGuard } from './features/accounts/instructor-create-page';
import { LoginPage } from './features/auth/login-page';
import { ProgressPage } from './features/progress/progress-page';

export const routes: Routes = [
  { path: 'plantillas-certificados', loadComponent: () => import('./features/certificates/certificate-templates-page').then(m => m.CertificateTemplatesPage), canActivate: [roleGuard(['ADMIN'])], canDeactivate: [async (component: import('./features/certificates/certificate-templates-page').CertificateTemplatesPage) => component.canLeave()], title: 'Plantillas de certificados | EVA' },
  { path: 'verificar', loadComponent: () => import('./features/certificates/certificate-verification-page').then(m => m.CertificateVerificationPage), title: 'Verificar certificado | EVA' },
  { path: 'verificar/:codigo', loadComponent: () => import('./features/certificates/certificate-verification-page').then(m => m.CertificateVerificationPage), title: 'Verificar certificado | EVA' },
  { path: 'certificados', loadComponent: () => import('./features/certificates/certificate-emission-page').then(m => m.CertificateEmissionPage), canActivate: [roleGuard(['ADMIN'])], title: 'Emitir certificados | EVA' },
  { path: 'mis-certificados', loadComponent: () => import('./features/certificates/my-certificates-page').then(m => m.MyCertificatesPage), canActivate: [roleGuard(['PARTICIPANT'])], title: 'Mis certificados | EVA' },
  { path: 'mis-certificados/:id', loadComponent: () => import('./features/certificates/certificate-detail-page').then(m => m.CertificateDetailPage), canActivate: [roleGuard(['PARTICIPANT'])], title: 'Detalle del certificado | EVA' },
  { path: 'iniciar-sesion', component: LoginPage, title: 'Iniciar sesión | EVA' },
  { path: 'mi-progreso', component: ProgressPage, canActivate: [roleGuard(['PARTICIPANT'])], title: 'Mi progreso | EVA' },
  { path: '', redirectTo: 'catalogo', pathMatch: 'full' },
  { path: 'cursos/nuevo', component: CoursesPage, canActivate: [roleGuard(['ADMIN'])], data: { createCourse: true }, title: 'Nuevo curso | EVA' },
  { path: 'cursos/:courseId/editar', component: CoursesPage, canActivate: [roleGuard(['ADMIN'])], data: { editCourse: true }, title: 'Editar curso | EVA' },
  { path: 'cursos', component: CoursesWorkspace, canActivate: [roleGuard(['ADMIN', 'INSTRUCTOR'])], title: 'Cursos | EVA' },
  { path: 'cursos/:courseId/sesiones', component: CourseSessionsPage, canActivate: [roleGuard(['ADMIN', 'INSTRUCTOR'])], title: 'Sesiones del curso | EVA' },
  { path: 'cursos/:courseId/asistencia', component: AttendancePage, canActivate: [roleGuard(['ADMIN', 'INSTRUCTOR'])], title: 'Asistencia del curso | EVA' },
  { path: 'mis-cursos', redirectTo: 'cursos', pathMatch: 'full' },
  { path: 'inscripciones', component: EnrollmentsPage, canActivate: [roleGuard(['ADMIN'])], title: 'Inscripciones | EVA' },
  { path: 'inscripciones/:enrollmentId', component: EnrollmentDetailPage, canActivate: [roleGuard(['ADMIN'])], title: 'Detalle de inscripción | EVA' },
  { path: 'usuarios', component: AccountDirectoryPage, canActivate: [roleGuard(['ADMIN'])], data: { directory: 'users' }, title: 'Usuarios | EVA' },
  { path: 'instructores', component: AccountDirectoryPage, canActivate: [roleGuard(['ADMIN'])], data: { directory: 'instructors' }, title: 'Instructores | EVA' },
  { path: 'instructores/nuevo', component: InstructorCreatePage, canActivate: [roleGuard(['ADMIN'])], canDeactivate: [instructorDraftGuard], title: 'Nuevo instructor | EVA' },
  { path: 'asistencia-instructores', component: InstructorAttendancePage, canActivate: [roleGuard(['ADMIN'])], title: 'Asistencia de instructores | EVA' },
  { path: 'catalogo', component: ParticipantCatalogPage, title: 'Cursos disponibles | EVA' },
  { path: 'catalogo/:id', component: ParticipantCourseDetailPage, title: 'Detalle del curso | EVA' }
];
