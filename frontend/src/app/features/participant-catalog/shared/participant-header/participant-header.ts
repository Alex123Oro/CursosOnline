import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-participant-header',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './participant-header.html',
  styleUrl: './participant-header.scss'
})
export class ParticipantHeader {
  readonly label = input('Formación continua');
}
