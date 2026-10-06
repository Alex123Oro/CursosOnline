import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../environments/environment';

export type UserRole = 'ADMIN' | 'PARTICIPANT' | 'INSTRUCTOR';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  participantTypeId: string | null;
  participantTypeName: string | null;
}

const STORAGE_KEY = 'eva-user-id';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly usersState = signal<SessionUser[]>([]);
  readonly users = computed(() => this.usersState());
  readonly userId = signal(localStorage.getItem(STORAGE_KEY) ?? '');
  readonly currentUser = computed(() => this.usersState().find(user => user.id === this.userId()) ?? null);

  private readonly http: HttpClient;

  constructor(backend: HttpBackend) {
    // Session discovery must not invoke the interceptor that depends on this service.
    this.http = new HttpClient(backend);
    this.refreshUsers();
  }

  refreshUsers() {
    this.http.get<SessionUser[]>(`${environment.apiBaseUrl}/session/users`).subscribe({
      next: users => {
        this.usersState.set(users);
        if (!this.userId() && users[0]) {
          this.selectUser(users[0].id);
        } else if (this.userId() && !users.some(user => user.id === this.userId()) && users[0]) {
          this.selectUser(users[0].id);
        }
      },
      error: () => this.usersState.set([])
    });
  }

  selectUser(id: string) {
    this.userId.set(id);
    localStorage.setItem(STORAGE_KEY, id);
  }
}
