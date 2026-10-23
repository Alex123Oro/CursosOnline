import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService, type SessionUser } from '../../core/session.service';

@Component({
  selector: 'app-confirm-email-page', standalone: true, imports: [RouterLink],
  template: `<main class="login-page"><section class="login-panel" aria-labelledby="confirmation-title">
    <a class="login-brand" routerLink="/catalogo"><span class="brand-mark" aria-hidden="true">E</span><span>EVA</span></a>
    <h1 id="confirmation-title">{{ loading() ? 'Confirmando tu correo…' : user() ? 'Tu cuenta está lista' : 'Confirmación de correo' }}</h1>
    @if (loading()) { <p class="login-subtitle" role="status">Estamos comprobando tu correo y preparando tu acceso.</p> }
    @if (user(); as account) {
      <p class="login-subtitle" role="status">Bienvenido, {{ account.name }}. Tu correo fue confirmado.</p>
      <p>Tu categoría: <strong>{{ account.participantTypeName === 'Estudiante' ? 'Estudiante UMSS' : account.participantTypeName }}</strong>.</p>
      <a class="catalog-link" routerLink="/mis-cursos">Entrar a mi campus</a><br>
      <a class="catalog-link" routerLink="/catalogo">Explorar cursos</a>
    }
    @if (feedback()) { <p class="login-error" role="alert">{{ feedback() }}</p>
      <a class="catalog-link" routerLink="/registrarse">Solicitar otro enlace</a><br>
      <a class="catalog-link" routerLink="/iniciar-sesion">Ya confirmé mi correo: iniciar sesión</a>
    }
  </section></main>`, styleUrl: './login-page.scss'
})
export class ConfirmEmailPage {
  private readonly session = inject(SessionService);
  readonly loading = signal(false);
  readonly feedback = signal('');
  readonly user = signal<SessionUser | null>(null);

  constructor() {
    const view = inject(DOCUMENT).defaultView;
    const params = new URLSearchParams(view?.location.hash.slice(1) ?? '');
    const token = params.get('access_token');
    // Remove credentials from browser history before rendering or making requests.
    if (view?.location.hash) view.history.replaceState(view.history.state, '', view.location.pathname + view.location.search);
    if (!token || params.has('error')) {
      this.feedback.set('El enlace no es válido, ya fue utilizado o ha vencido. Si ya confirmaste tu correo, inicia sesión; también puedes solicitar otro enlace.');
      return;
    }
    this.loading.set(true);
    this.session.confirmEmail(token).subscribe({
      next: user => { this.user.set(user); this.loading.set(false); },
      error: error => {
        this.loading.set(false);
        this.feedback.set(error instanceof HttpErrorResponse ? error.error?.message ?? 'No se pudo comprobar el correo. Intenta iniciar sesión.' : 'No se pudo comprobar el correo. Intenta iniciar sesión.');
      }
    });
  }
}
