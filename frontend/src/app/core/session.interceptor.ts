import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { SessionService } from './session.service';

export const sessionInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const token = session.accessToken();
  const userId = session.userId();

  if (!token && !userId) {
    return next(req);
  }

  const authenticatedRequest = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req.clone({ setHeaders: { 'X-User-Id': userId } });

  return next(authenticatedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && token) {
        session.endSessionLocally();
        void router.navigateByUrl('/iniciar-sesion');
      }
      return throwError(() => error);
    })
  );
};
