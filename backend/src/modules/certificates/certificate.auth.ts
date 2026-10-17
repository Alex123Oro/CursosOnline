import type { Request } from 'express';
import { getServerSupabase } from '../../config/supabase.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { HttpError } from '../../shared/http-error.js';
import type { CertificateRole, CertificateUser } from './certificate.types.js';
import { certificateDatabaseId } from './certificate-id.js';

type CertificateRequest = Request & { certificateUser?: CertificateUser };
const roles: Record<string, CertificateRole> = {
  administrador: 'ADMIN', instructor: 'INSTRUCTOR', participante: 'PARTICIPANT'
};

export const requireCertificateRole = (role: CertificateRole) => asyncHandler(async (request, _response, next) => {
  const token = request.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new HttpError(401, 'Debe identificarse para continuar.');
  const db = getServerSupabase();
  const { data: identity, error: authError } = await db.auth.getUser(token);
  if (authError || !identity.user) {
    if (authError && (authError.status === 0 || (authError.status ?? 0) >= 500)) {
      throw new HttpError(503, 'No se pudo validar la sesión.');
    }
    throw new HttpError(401, 'La sesión no es válida.');
  }
  const { data: profile, error } = await db.from('usuarios').select('id,rol,activo')
    .eq('auth_id', identity.user.id).maybeSingle();
  if (error) throw new HttpError(503, 'No se pudo consultar el perfil.');
  if (!profile || profile.activo === false) throw new HttpError(401, 'La cuenta no está habilitada.');
  const actualRole = roles[String(profile.rol)];
  if (actualRole !== role) throw new HttpError(403, 'No tiene permisos para realizar esta operación.');
  (request as CertificateRequest).certificateUser = { id: certificateDatabaseId(profile.id), role: actualRole };
  next();
});

export const certificateUser = (request: Request): CertificateUser => {
  const user = (request as CertificateRequest).certificateUser;
  if (!user) throw new HttpError(401, 'Debe identificarse para continuar.');
  return user;
};
