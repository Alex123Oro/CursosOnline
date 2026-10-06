import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SessionService } from './core/session.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly router = inject(Router);
  readonly session = inject(SessionService);
  readonly sidebarOpen = signal(false);
  readonly isPublicRoute = signal(this.router.url.startsWith('/catalogo'));

  constructor() {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.isPublicRoute.set(this.router.url.startsWith('/catalogo'));
        this.sidebarOpen.set(false);
      });
  }

  onSessionChange(id: string) {
    this.session.selectUser(id);
    const role = this.session.currentUser()?.role;
    void this.router.navigateByUrl(role === 'INSTRUCTOR' ? '/mis-cursos' : role === 'ADMIN' ? '/cursos' : '/catalogo');
  }
}
