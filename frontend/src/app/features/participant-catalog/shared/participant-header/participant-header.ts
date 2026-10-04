import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
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

  onSessionChange(id: string) {
    this.session.selectUser(id);
  }
}
