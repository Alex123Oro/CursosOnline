import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, defer, finalize, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

export type UserRole = 'ADMIN' | 'PARTICIPANT' | 'INSTRUCTOR';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  participantTypeId: string | null;
  participantTypeName: string | null;
  sis?: string | null;
  degree?: 'Estudiante' | 'Ingeniero' | 'Técnico' | null;
  phone?: string | null;
}

const STORAGE_KEY = 'eva-user-id';
const USER_DATA_KEY = 'eva-user';
const ACCESS_TOKEN_KEY = 'eva-access-token';
const REFRESH_TOKEN_KEY = 'eva-refresh-token';
const EXPIRES_AT_KEY = 'eva-expires-at';
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

export interface ParticipantRegistration {
  name: string;
  email: string;
  password: string;
  participantKind: 'UMSS' | 'EXTERNAL';
  returnTo?: string;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly usersState = signal<SessionUser[]>([]);
  readonly users = computed(() => this.usersState());
  readonly ready = signal(false);
  readonly userId = signal(localStorage.getItem(STORAGE_KEY) ?? readStoredUser()?.id ?? '');
  readonly currentUser = computed(() => this.usersState().find(user => user.id === this.userId()) ?? null);
  readonly accessToken = signal(localStorage.getItem(ACCESS_TOKEN_KEY) ?? '');
  readonly connectionIssue = signal('');
  readonly reconnecting = signal(false);
  private renewal: Observable<string> | null = null;
  private renewalTimer: ReturnType<typeof setTimeout> | undefined;
  private restoreTimer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private readonly destroy = inject(DestroyRef);

  private readonly http: HttpClient;

  constructor(backend: HttpBackend) {
    // Session discovery must not invoke the interceptor that depends on this service.
    this.http = new HttpClient(backend);
    this.destroy.onDestroy(() => { clearTimeout(this.renewalTimer); clearTimeout(this.restoreTimer); });
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
        this.generation++;
        this.acceptSession(result);
        this.ready.set(true);
        if (result.user.role === 'ADMIN') this.refreshUsers(result.accessToken);
      }),
      map(result => result.user)
    );
  }

  register(input: ParticipantRegistration) {
    return this.http.post<{ message: string }>(`${environment.apiBaseUrl}/auth/register`, input);
  }

  resendConfirmation(email: string, returnTo?: string) {
    return this.http.post<{ message: string }>(`${environment.apiBaseUrl}/auth/resend-confirmation`, { email, ...(returnTo ? { returnTo } : {}) });
  }

  confirmEmail(token: string, refreshToken?: string) {
    return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/auth/confirm-email`, refreshToken ? { refreshToken } : {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(tap(result => {
      this.generation++;
      this.acceptSession(result);
      this.ready.set(true);
    }), map(result => result.user));
  }

  renewSession() {
    if (this.renewal) return this.renewal;
    const version = this.accessToken();
    const generation = this.generation;
    this.renewal = defer(() => {
      const token = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!token) return throwError(() => new HttpErrorResponse({ status: 401 }));
      return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/auth/refresh`, { refreshToken: token });
    }).pipe(
      tap(result => {
        if (this.accessToken() !== version || generation !== this.generation) throw new HttpErrorResponse({ status: 409 });
        this.acceptSession(result);
      }),
      map(result => result.accessToken),
      catchError(error => {
        if (this.accessToken() === version && generation === this.generation) {
          if (error.status === 401 || error.status === 403) this.clearLocalSession();
          else { this.connectionIssue.set('No se pudo renovar la sesión. Reintentaremos la conexión.'); this.scheduleRenewal(30000); }
        }
        return throwError(() => error);
      }),
      finalize(() => { this.renewal = null; }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.renewal;
  }

  retryConnection() {
    if (this.accessToken() && !this.reconnecting()) this.restoreSession(this.accessToken());
  }

  logout() {
    const token = this.accessToken();
    const generation = this.generation;
    if (!token) {
      this.endSessionLocally();
      return of(void 0);
    }

    return this.http.post<void>(`${environment.apiBaseUrl}/auth/logout`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      catchError(() => of(void 0)),
      finalize(() => { if (generation === this.generation) this.endSessionLocally(); })
    );
  }

  addInstructor(user: SessionUser) {
    this.usersState.update(users => [...users.filter(existing => existing.id !== user.id), user]);
  }

  private restoreSession(token: string) {
    const generation = this.generation;
    this.reconnecting.set(true);
    clearTimeout(this.restoreTimer);
    this.http.get<SessionUser>(`${environment.apiBaseUrl}/session/me`, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(catchError(error => {
      if (generation !== this.generation) return throwError(() => error);
      if (error.status !== 401) return throwError(() => error);
      return this.renewSession().pipe(switchMap(newToken => this.http.get<SessionUser>(`${environment.apiBaseUrl}/session/me`, {
        headers: { Authorization: `Bearer ${newToken}` }
      })));
    }), finalize(() => this.reconnecting.set(false))).subscribe({
      next: user => {
        if (generation !== this.generation || !this.accessToken()) return;
        localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
        this.userId.set(user.id);
        localStorage.setItem(STORAGE_KEY, user.id);
        this.usersState.set([user]);
        this.ready.set(true);
        this.connectionIssue.set('');
        this.scheduleRenewal();
        if (user.role === 'ADMIN') this.refreshUsers(this.accessToken());
      },
      error: (error: HttpErrorResponse) => {
        if (generation !== this.generation || !this.accessToken()) return;
        if (error.status === 401 || error.status === 403) this.clearLocalSession();
        else {
          this.ready.set(true);
          this.connectionIssue.set('La conexión se interrumpió. Tu sesión se conserva mientras reintentamos.');
          this.restoreTimer = setTimeout(() => this.retryConnection(), 30000);
        }
      }
    });
  }

  private refreshUsers(token = this.accessToken()) {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    this.http.get<SessionUser[]>(`${environment.apiBaseUrl}/session/users`, { headers }).subscribe({
      next: users => {
        if (token !== this.accessToken()) return;
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

  private acceptSession(result: AuthResponse) {
    this.persistSession(result.user, result.accessToken);
    if (result.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
    if (result.expiresAt) localStorage.setItem(EXPIRES_AT_KEY, String(result.expiresAt));
    else localStorage.removeItem(EXPIRES_AT_KEY);
    this.connectionIssue.set('');
    this.scheduleRenewal();
  }

  private scheduleRenewal(retryDelay?: number) {
    clearTimeout(this.renewalTimer);
    const expires = Number(localStorage.getItem(EXPIRES_AT_KEY));
    if (!localStorage.getItem(REFRESH_TOKEN_KEY) || (!expires && retryDelay === undefined)) return;
    const delay = retryDelay ?? Math.min(2147000000, Math.max(1000, expires * 1000 - Date.now() - 60000));
    this.renewalTimer = setTimeout(() => this.renewSession().subscribe({ error: () => {} }), delay);
  }

  private clearLocalSession() {
    this.generation++;
    clearTimeout(this.renewalTimer);
    clearTimeout(this.restoreTimer);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
    this.connectionIssue.set('');
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
