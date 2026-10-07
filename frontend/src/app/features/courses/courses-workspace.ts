import { Component, inject } from '@angular/core';
import { SessionService } from '../../core/session.service';
import { CoursesPage } from './courses-page/courses-page';
import { TeachingCoursesPage } from '../course-sessions/teaching-courses-page';

@Component({ selector: 'app-courses-workspace', imports: [CoursesPage, TeachingCoursesPage], template: `
  @if (session.currentUser()?.role === 'ADMIN') { <app-courses-page /> }
  @if (session.currentUser()?.role === 'INSTRUCTOR') { <app-teaching-courses-page /> }
` })
export class CoursesWorkspace { readonly session = inject(SessionService); }
