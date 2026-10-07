import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { SessionService, UserRole } from './session.service';

export const profileHome = (role?: UserRole) => role === 'ADMIN' || role === 'INSTRUCTOR' ? '/cursos' : '/catalogo';

export const roleGuard = (roles: UserRole[]): CanActivateFn => () => {
  const session = inject(SessionService);
  const router = inject(Router);
  return toObservable(session.ready).pipe(filter(Boolean), take(1), map(() => {
    const role = session.currentUser()?.role;
    return role && roles.includes(role) ? true : router.parseUrl(profileHome(role));
  }));
};
