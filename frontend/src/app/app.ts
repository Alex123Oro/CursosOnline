import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SessionNavigationService } from './core/session-navigation.service';
import { SessionService } from './core/session.service';
import { isCertificateVerificationRoute } from './core/public-request';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrls: ['./app.scss', './participant-shell.scss']
})
export class App {
  private readonly router = inject(Router);
  readonly session = inject(SessionService);
  readonly navigation = inject(SessionNavigationService);
  readonly sidebarOpen = signal(false);
  readonly isPublicRoute = signal(this.router.url.startsWith('/catalogo') || this.router.url.startsWith('/iniciar-sesion') || isCertificateVerificationRoute(this.router.url));
  canReturnToCourses() { const role = this.session.currentUser()?.role; return role === 'ADMIN' || role === 'INSTRUCTOR'; }
  isCoursesHome() { return this.router.url === '/cursos' || this.router.url === '/cursos/'; }

  constructor() {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.isPublicRoute.set(this.router.url.startsWith('/catalogo') || this.router.url.startsWith('/iniciar-sesion') || isCertificateVerificationRoute(this.router.url));
        this.sidebarOpen.set(false);
      });
  }

  logout() {
    this.session.logout().subscribe();
  }
}
