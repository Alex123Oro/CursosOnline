import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { catchError, finalize, map, of, tap } from 'rxjs';
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
const USER_DATA_KEY = 'eva-user';
const ACCESS_TOKEN_KEY = 'eva-access-token';
const LOGGED_OUT_KEY = 'eva-logged-out';

const readStoredUser = (): SessionUser | null => {
  const raw = localStorage.getItem(USER_DATA_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed?.id || !parsed?.role || !parsed?.email) return null;
    return parsed;
  } catch {
    localStorage.removeItem(USER_DATA_KEY);
    return null;
  }
};

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  user: SessionUser;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly usersState = signal<SessionUser[]>([]);
  readonly users = computed(() => this.usersState());
  readonly ready = signal(false);
  readonly baseSessionUsers = computed(() => this.usersState().slice(0, 4).filter(user => user.role !== 'INSTRUCTOR'));
  readonly instructorSessionUsers = computed(() => this.usersState().filter(user => user.role === 'INSTRUCTOR'));
  readonly sessionUsers = computed(() => [...this.baseSessionUsers(), ...this.instructorSessionUsers()]);
  readonly userId = signal(localStorage.getItem(STORAGE_KEY) ?? readStoredUser()?.id ?? '');
  readonly currentUser = computed(() => this.usersState().find(user => user.id === this.userId()) ?? null);
  readonly accessToken = signal(localStorage.getItem(ACCESS_TOKEN_KEY) ?? '');

  private readonly http: HttpClient;

  constructor(backend: HttpBackend) {
    // Session discovery must not invoke the interceptor that depends on this service.
    this.http = new HttpClient(backend);
    const token = this.accessToken();
    const storedUser = token ? readStoredUser() : null;
    if (storedUser) {
      this.usersState.set([storedUser]);
      this.userId.set(storedUser.id);
    }

    if (token) this.restoreSession(token);
    else {
      this.userId.set('');
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(USER_DATA_KEY);
      this.ready.set(true);
    }
  }

  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/auth/login`, { email, password }).pipe(
      tap(result => {
        this.persistSession(result.user, result.accessToken);
        this.ready.set(true);
        if (result.user.role === 'ADMIN') this.refreshUsers(result.accessToken);
      }),
      map(result => result.user)
    );
  }

  logout() {
    const token = this.accessToken();
    if (!token) {
      this.endSessionLocally();
      return of(void 0);
    }

    return this.http.post<void>(`${environment.apiBaseUrl}/auth/logout`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      catchError(() => of(void 0)),
      finalize(() => this.endSessionLocally())
    );
  }

  selectUser(id: string) {
    const selectedUser = this.usersState().find(user => user.id === id) ?? null;
    if (id && !selectedUser) return;
    this.accessToken.set('');
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(LOGGED_OUT_KEY);
    this.userId.set(id);
    if (selectedUser) {
      localStorage.setItem(STORAGE_KEY, id);
      localStorage.setItem(USER_DATA_KEY, JSON.stringify(selectedUser));
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(USER_DATA_KEY);
    }
  }

  private restoreSession(token: string) {
    this.http.get<SessionUser>(`${environment.apiBaseUrl}/session/me`, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: user => {
        this.userId.set(user.id);
        localStorage.setItem(STORAGE_KEY, user.id);
        this.usersState.set([user]);
        this.ready.set(true);
        if (user.role === 'ADMIN') this.refreshUsers(token);
      },
      error: () => this.clearLocalSession()
    });
  }

  private refreshUsers(token = this.accessToken()) {
    const headers: Record<string, string> | undefined = token
      ? { Authorization: `Bearer ${token}` }
      : this.userId() ? { 'X-User-Id': this.userId() } : undefined;
    this.http.get<SessionUser[]>(`${environment.apiBaseUrl}/session/users`, { headers }).subscribe({
      next: users => {
        this.usersState.set(users);
        this.ready.set(true);
      },
      error: () => { if (!token) this.usersState.set([]); this.ready.set(true); }
    });
  }

  private persistSession(user: SessionUser, accessToken: string) {
    localStorage.removeItem(LOGGED_OUT_KEY);
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(STORAGE_KEY, user.id);
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
    this.accessToken.set(accessToken);
    this.userId.set(user.id);
    this.usersState.set([user]);
  }

  private clearLocalSession() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_DATA_KEY);
    this.accessToken.set('');
    this.userId.set('');
    this.usersState.set([]);
    this.ready.set(true);
  }

  endSessionLocally() {
    localStorage.setItem(LOGGED_OUT_KEY, 'true');
    this.clearLocalSession();
  }
}
