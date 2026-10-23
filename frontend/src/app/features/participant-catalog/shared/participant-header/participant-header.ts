import { Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { returnToCourse } from '../../../../core/return-to-course';
import { SessionService } from '../../../../core/session.service';

@Component({
  selector: 'app-participant-header',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './participant-header.html',
  styleUrl: './participant-header.scss'
})
export class ParticipantHeader {
  readonly session = inject(SessionService);
  readonly label = input('Formación continua');
  private readonly router = inject(Router);
  continuation() { const returnTo = returnToCourse(this.router.url.split('?')[0]); return returnTo ? { returnTo } : {}; }

  logout() {
    this.session.logout().subscribe();
  }
}
