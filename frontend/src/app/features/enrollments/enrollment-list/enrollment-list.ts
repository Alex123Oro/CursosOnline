import { Component, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { Enrollment } from '../../../core/enrollment.service';
import { EnrollmentStatus } from '../../../core/course.service';
@Component({
  selector: 'app-enrollment-list',
  imports: [RouterLink],
  templateUrl: './enrollment-list.html',
  styleUrl: './enrollment-list.scss',
})
export class EnrollmentList {
  readonly enrollments = input<Enrollment[]>([]);
  readonly loading = input(false);
  readonly status = input<EnrollmentStatus>('PREINSCRITO');
  readonly context = input<Params>({});
  paymentLabel(value: Enrollment['paymentStatus']) {
    return {
      NO_REQUIERE: 'No requiere',
      PAGADO: 'Pagado',
      PARCIAL: 'Parcial',
      PENDIENTE: 'Pendiente',
    }[value];
  }
  formatDate(date: string) {
    return new Intl.DateTimeFormat('es-BO', {
      dateStyle: 'medium',
      timeZone: 'America/La_Paz',
    }).format(new Date(date));
  }
}
