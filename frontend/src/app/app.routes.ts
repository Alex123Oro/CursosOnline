import { Routes } from '@angular/router';
import { CoursesPage } from './features/courses/courses-page/courses-page';

export const routes: Routes = [
  { path: '', redirectTo: 'cursos', pathMatch: 'full' },
  { path: 'cursos', component: CoursesPage }
];
