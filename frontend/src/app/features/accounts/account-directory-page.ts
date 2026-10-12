import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SessionService, SessionUser } from '../../core/session.service';

type DirectoryView = 'users' | 'instructors';

@Component({
  selector: 'app-account-directory-page',
  standalone: true,
  templateUrl: './account-directory-page.html',
  styleUrl: './account-directory-page.scss'
})
export class AccountDirectoryPage {
  private readonly route = inject(ActivatedRoute);
  readonly session = inject(SessionService);
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
      const searchable = `${user.name} ${user.email} ${user.role} ${user.participantTypeName ?? ''}`.toLocaleLowerCase();
      return !term || searchable.includes(term);
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