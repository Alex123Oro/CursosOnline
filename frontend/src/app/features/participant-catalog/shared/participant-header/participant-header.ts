import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionNavigationService } from '../../../../core/session-navigation.service';
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
  readonly navigation = inject(SessionNavigationService);
  readonly label = input('Formación continua');

  onSessionChange(id: string) {
    this.session.selectUser(id);
  }
}
