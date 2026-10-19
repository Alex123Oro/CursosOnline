import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { SessionService } from './session.service';
import { PUBLIC_REQUEST, isCertificateVerificationRoute } from './public-request';

export const sessionInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(PUBLIC_REQUEST)) return next(req);
  const session = inject(SessionService);
  const router = inject(Router);
  const token = session.accessToken();

  if (!token) {
    return next(req);
  }

  const authenticatedRequest = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

  return next(authenticatedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && token) {
        session.endSessionLocally();
        if (!isCertificateVerificationRoute(router.url)) void router.navigateByUrl('/iniciar-sesion');
      }
      return throwError(() => error);
    })
  );
};
