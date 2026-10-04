import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { SessionService } from './session.service';

export const sessionInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);
  const userId = session.userId();

  if (!userId) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { 'X-User-Id': userId } })).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && userId) {
        localStorage.removeItem('eva-user-id');
        window.location.reload();
      }
      return throwError(() => error);
    })
  );
};
