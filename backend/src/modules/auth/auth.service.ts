import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { HttpError } from '../../shared/http-error.js';

type SupabaseUser = { id: string; email?: string; email_confirmed_at?: string | null };
type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  user: SupabaseUser;
};

const authUrl = (path: string) => `${env.supabaseUrl}/auth/v1/${path}`;
const apiKey = () => env.supabasePublishableKey ?? env.supabaseSecretKey;

const authHeaders = (token?: string) => ({
  apikey: apiKey() ?? '',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  'Content-Type': 'application/json'
});

const accountFor = async (identity: SupabaseUser) => {
  const select = {
    id: true, name: true, email: true, role: true, participantTypeId: true,
    participantType: { select: { name: true } }
  } as const;
  const account = await prisma.user.findUnique({
    where: { authId: identity.id },
    select
  });

  if (!account) throw new HttpError(403, 'La cuenta no tiene un perfil habilitado en el sistema.');
  return {
    id: String(account.id),
    name: account.name,
    email: account.email,
    role: account.role,
    participantTypeId: account.participantTypeId === null ? null : String(account.participantTypeId),
    participantTypeName: account.participantType?.name ?? null
  };
};

export const authService = {
  async login(email: string, password: string) {
    if (!env.supabaseUrl || !apiKey()) {
      throw new HttpError(503, 'La autenticacion de Supabase no esta configurada.');
    }

    let response: Response;
    try {
      response = await fetch(authUrl('token?grant_type=password'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(15000)
      });
    } catch {
      throw new HttpError(503, 'No se pudo conectar con el servicio de autenticacion.');
    }

    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) throw new HttpError(503, 'El servicio de autenticacion no esta disponible.');
      const failure = await response.json().catch(() => ({})) as { code?: string };
      if (failure.code === 'email_not_confirmed') throw new HttpError(403, 'Confirma tu correo antes de iniciar sesión. Puedes reenviar el enlace desde Crear cuenta.');
      throw new HttpError(401, 'Correo o contraseña incorrectos.');
    }
    const session = await response.json() as SupabaseSession;
    const user = await accountFor(session.user);
    return { accessToken: session.access_token, refreshToken: session.refresh_token,
      expiresAt: session.expires_at ?? (session.expires_in ? Math.floor(Date.now() / 1000) + session.expires_in : null), user };
  },

  async refresh(refreshToken: string) {
    if (!env.supabaseUrl || !apiKey()) throw new HttpError(503, 'La autenticación no está configurada.');
    let response: Response;
    try {
      response = await fetch(authUrl('token?grant_type=refresh_token'), {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ refresh_token: refreshToken }), signal: AbortSignal.timeout(15000)
      });
    } catch { throw new HttpError(503, 'No se pudo renovar la sesión. Inténtalo nuevamente.'); }
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) throw new HttpError(503, 'El servicio de autenticación no está disponible.');
      throw new HttpError(401, 'La sesión ha vencido. Inicia sesión nuevamente.');
    }
    const session = await response.json().catch(() => null) as SupabaseSession | null;
    if (!session?.access_token || !session.refresh_token || !session.user?.id) throw new HttpError(503, 'No se pudo renovar la sesión.');
    return { accessToken: session.access_token, refreshToken: session.refresh_token,
      expiresAt: session.expires_at ?? (session.expires_in ? Math.floor(Date.now() / 1000) + session.expires_in : null), user: await accountFor(session.user) };
  },

  async confirmEmail(token: string, refreshToken?: string) {
    const identity = await verifyAccessToken(token);
    if (!identity) throw new HttpError(401, 'El enlace no es válido o ha vencido. Solicita uno nuevo.');
    if (!identity.email_confirmed_at) throw new HttpError(403, 'Primero debes confirmar tu correo electrónico.');
    const user = await accountFor(identity);
    if (refreshToken) {
      const renewed = await authService.refresh(refreshToken);
      if (renewed.user.id !== user.id) throw new HttpError(401, 'La confirmación no corresponde a esta sesión.');
      return renewed;
    }
    return { accessToken: token, refreshToken: '', expiresAt: null, user };
  },

  async logout(token: string) {
    if (!env.supabaseUrl || !apiKey()) return;
    const response = await fetch(authUrl('logout'), { method: 'POST', headers: authHeaders(token), signal: AbortSignal.timeout(15000) });
    if (!response.ok && response.status !== 401) throw new HttpError(503, 'No se pudo finalizar la sesion en Supabase.');
  }
};

export const verifyAccessToken = async (token: string): Promise<SupabaseUser | null> => {
  if (!env.supabaseUrl || !apiKey()) throw new HttpError(503, 'La autenticación no está configurada.');
  let response: Response;
  try {
    response = await fetch(authUrl('user'), { headers: authHeaders(token), signal: AbortSignal.timeout(15000) });
  } catch {
    throw new HttpError(503, 'No se pudo validar la sesión. Inténtalo nuevamente.');
  }
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new HttpError(503, 'No se pudo validar la sesión. Inténtalo nuevamente.');
  try { return await response.json() as SupabaseUser; }
  catch { throw new HttpError(503, 'No se pudo validar la sesión. Inténtalo nuevamente.'); }
};
