import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SessionService, SessionUser } from '../../core/session.service';

type DirectoryView = 'users' | 'instructors';

@Component({
  selector: 'app-account-directory-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './account-directory-page.html',
  styleUrl: './account-directory-page.scss'
})
export class AccountDirectoryPage {
  private readonly route = inject(ActivatedRoute);
  readonly session = inject(SessionService);
  readonly createdName = signal<string>(inject(Router).getCurrentNavigation()?.extras.state?.['instructorCreated'] ?? history.state?.instructorCreated ?? '');
  readonly view = signal<DirectoryView>('users');
  readonly query = signal('');

  readonly title = computed(() => this.view() === 'instructors' ? 'Instructores' : 'Usuarios');
  readonly description = computed(() => this.view() === 'instructors'
    ? 'Consulta las cuentas con rol de instructor.'
    : 'Consulta las cuentas registradas en el sistema.');
  readonly accounts = computed(() => {
    const term = this.query().trim().toLocaleLowerCase();
    return this.session.users().filter(user => {
      if (this.view() === 'instructors' && user.role !== 'INSTRUCTOR') return false;
      const fields = this.view() === 'instructors'
        ? [user.name, user.email, user.sis, user.phone]
        : [user.name, user.email, user.role, user.participantTypeName];
      const searchable = fields.filter(Boolean).join(' ').toLocaleLowerCase();
      const phoneTerm = /^[+\d ().-]+$/.test(term) ? term.replace(/\D/g, '') : '';
      const matchesPhone = this.view() === 'instructors' && !!phoneTerm
        && (user.phone ?? '').replace(/\D/g, '').includes(phoneTerm);
      return !term || searchable.includes(term) || matchesPhone;
    });
  });

  constructor() {
    this.route.data.subscribe(data => {
      this.view.set(data['directory'] === 'instructors' ? 'instructors' : 'users');
      this.query.set('');
    });
  }

  onSearch(value: string) {
    this.query.set(value);
  }

  roleLabel(user: SessionUser) {
    if (user.role === 'ADMIN') return 'Administrador';
    if (user.role === 'INSTRUCTOR') return 'Instructor';
    return 'Participante';
  }
}
