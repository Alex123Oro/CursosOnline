import { Routes } from '@angular/router';
import { CoursesPage } from './features/courses/courses-page/courses-page';
import { ParticipantCatalogPage } from './features/participant-catalog/participant-catalog-page/participant-catalog-page';

export const routes: Routes = [
  { path: '', redirectTo: 'cursos', pathMatch: 'full' },
  { path: 'cursos', component: CoursesPage, title: 'Administración de cursos | EVA' },
  { path: 'catalogo', component: ParticipantCatalogPage, title: 'Cursos disponibles | EVA' }
];
