import { HttpContextToken } from '@angular/common/http';

export const PUBLIC_REQUEST = new HttpContextToken<boolean>(() => false);
export const isCertificateVerificationRoute = (url: string | undefined): boolean =>
  /^\/verificar(?:\/|$)/.test((url ?? '').split(/[?#]/)[0]);
