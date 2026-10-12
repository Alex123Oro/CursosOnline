import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { HttpError } from '../../shared/http-error.js';
import { randomUUID } from 'node:crypto';

type SupabaseUser = { id: string; email?: string };
type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: SupabaseUser;
};

const demoUsers = [
  { email: 'admin@eva.local', password: 'admin1234@', name: 'Ana Admin', role: 'ADMIN' as const },
  { email: 'carla.instructor@eva.local', password: 'instructor123@', name: 'Ing. Carla Mendoza', role: 'INSTRUCTOR' as const },
  { email: 'luis@eva.local', password: 'participante123@', name: 'Luis Estudiante', role: 'PARTICIPANT' as const }
];

const findDemoUser = (email: string, password: string) => demoUsers.find(account => account.email.toLowerCase() === email.trim().toLowerCase() && account.password === password);
const demoSessions = new Map<string, { id: string; email: string; expiresAt: number }>();

const authUrl = (path: string) => `${env.supabaseUrl}/auth/v1/${path}`;
const apiKey = () => env.supabasePublishableKey ?? env.supabaseSecretKey;

const authHeaders = (token?: string) => ({
  apikey: apiKey() ?? '',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  'Content-Type': 'application/json'
});

const accountFor = async (identity: SupabaseUser) => {
  const account = await prisma.user.findUnique({
    where: { authId: identity.id },
    include: { participantType: { select: { name: true } } }
  }) ?? (identity.email ? await prisma.user.findUnique({
    where: { email: identity.email },
    include: { participantType: { select: { name: true } } }
  }) : null);

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
    const demoUser = findDemoUser(email, password);
    if (demoUser && env.nodeEnv !== 'production') {
      const profile = await prisma.user.findUnique({ where: { email: demoUser.email }, select: { authId: true } });
      if (!profile) throw new HttpError(503, 'Falta el perfil local de demostracion. Ejecuta la carga inicial de datos.');
      const accessToken = `demo-${randomUUID()}`;
      const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
      demoSessions.set(accessToken, { id: profile.authId, email: demoUser.email, expiresAt });
      return {
        accessToken,
        refreshToken: '',
        expiresAt: Math.floor(expiresAt / 1000),
        user: await accountFor({ id: profile.authId, email: demoUser.email })
      };
    }

    if (!env.supabaseUrl || !apiKey()) throw new HttpError(503, 'La autenticacion de Supabase no esta configurada.');

    let response: Response;
    try {
      response = await fetch(authUrl('token?grant_type=password'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ email, password })
      });
    } catch {
      throw new HttpError(503, 'No se pudo conectar con el servicio de autenticacion.');
    }

    if (!response.ok) throw new HttpError(401, 'Correo o contraseña incorrectos.');
    const session = await response.json() as SupabaseSession;
    const user = await accountFor(session.user);
    return { accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at ?? null, user };
  },

  async logout(token: string) {
    if (demoSessions.delete(token)) return;
    if (!env.supabaseUrl || !apiKey()) return;
    const response = await fetch(authUrl('logout'), { method: 'POST', headers: authHeaders(token) });
    if (!response.ok && response.status !== 401) throw new HttpError(503, 'No se pudo finalizar la sesion en Supabase.');
  }
};

export const verifyAccessToken = async (token: string): Promise<SupabaseUser | null> => {
  const demoSession = demoSessions.get(token);
  if (demoSession) {
    if (demoSession.expiresAt <= Date.now()) {
      demoSessions.delete(token);
      return null;
    }
    return { id: demoSession.id, email: demoSession.email };
  }
  if (!env.supabaseUrl || !apiKey()) return null;
  try {
    const response = await fetch(authUrl('user'), { headers: authHeaders(token) });
    return response.ok ? await response.json() as SupabaseUser : null;
  } catch {
    return null;
  }
};
