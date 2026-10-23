import { z } from 'zod';
import { env } from '../../config/env.js';
import { HttpError } from '../../shared/http-error.js';

// Match complete domains; neither arbitrary UMSS subdomains nor suffixes qualify.
export const isUmssStudentEmail = (email: string) =>
  ['est.umss.edu', 'ms.umss.edu'].includes(email.trim().toLowerCase().split('@')[1] ?? '');

export const registrationSchema = z.object({
  name: z.string().trim().min(3, 'Ingresa tu nombre completo.').max(150),
  email: z.string().trim().toLowerCase().email('Ingresa un correo válido.').max(254),
  password: z.string().min(8, 'Usa al menos 8 caracteres.').max(128),
  participantKind: z.enum(['UMSS', 'EXTERNAL']),
  returnTo: z.string().regex(/^\/catalogo\/[1-9]\d*$/).optional()
}).strict().superRefine((input, ctx) => {
  if ((input.participantKind === 'UMSS') !== isUmssStudentEmail(input.email)) {
    ctx.addIssue({ code: 'custom', path: ['email'], message: input.participantKind === 'UMSS'
      ? 'Usa tu correo @est.umss.edu o @ms.umss.edu.'
      : 'Este correo es institucional estudiantil. Selecciona Estudiante UMSS.' });
  }
});
export const registrationEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email('Ingresa un correo válido.').max(254),
  returnTo: z.string().regex(/^\/catalogo\/[1-9]\d*$/).optional()
}).strict();

const confirmationMessage = 'Revisa tu correo y abre el enlace de confirmación. Si ya tienes una cuenta, inicia sesión.';
const unavailable = () => new HttpError(503, 'No se pudo completar la solicitud de correo. Inténtalo nuevamente.');

const redirectUrl = (returnTo?: string) => {
  const raw = env.authEmailRedirectUrl ?? (env.publicAppUrl ? `${env.publicAppUrl.replace(/\/$/, '')}/confirmar-correo` : '');
  let url: URL;
  try { url = new URL(raw); } catch { throw new HttpError(503, 'Falta configurar la dirección de confirmación del correo.'); }
  if (url.username || url.password || url.hash || url.search || url.pathname !== '/confirmar-correo' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new HttpError(503, 'La dirección de confirmación del correo no es válida.');
  }
  if (returnTo) url.searchParams.set('returnTo', returnTo);
  return url.href;
};

async function authRequest(path: string, body?: unknown) {
  // Signup must use the public key, never an administrative identity.
  if (!env.supabaseUrl || !env.supabasePublishableKey) throw unavailable();
  let response: Response;
  try {
    response = await fetch(`${env.supabaseUrl}/auth/v1/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { apikey: env.supabasePublishableKey, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000)
    });
  } catch { throw unavailable(); }
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    if (response.status === 429) throw new HttpError(429, 'Espera unos minutos antes de solicitar otro correo.');
    if (data?.code === 'weak_password') throw new HttpError(400, 'La contraseña no cumple los requisitos de seguridad.', [{ path: 'password', message: 'Usa una contraseña más segura.' }]);
    // Avoid exposing whether an address belongs to an existing account.
    if (data?.code === 'user_already_exists' || data?.code === 'email_exists') return {};
    throw unavailable();
  }
  if (!data) throw unavailable();
  return data;
}

async function assertEmailConfirmationEnabled() {
  const settings = await authRequest('settings');
  if (settings.disable_signup === true || settings.external && (settings.external as { email?: boolean }).email === false) {
    throw new HttpError(503, 'El registro por correo no está habilitado.');
  }
  if (settings.mailer_autoconfirm !== false && !(settings.mailer_autoconfirm === undefined && settings.autoconfirm === false)) {
    throw new HttpError(503, 'El registro requiere habilitar la confirmación de correo en Supabase.');
  }
}

export const registrationService = {
  async register(raw: unknown) {
    const input = registrationSchema.parse(raw);
    const redirect = redirectUrl(input.returnTo);
    await assertEmailConfirmationEnabled();
    const result = await authRequest(`signup?redirect_to=${encodeURIComponent(redirect)}`, {
      email: input.email, password: input.password,
      data: { nombre_completo: input.name, registration_source: 'eva-participant' }
    });
    // Never pass an auto-confirmed session back to the browser.
    if (result.access_token) throw new HttpError(503, 'El registro requiere confirmar el correo electrónico.');
    return { message: confirmationMessage };
  },

  async resend(raw: unknown) {
    const { email, returnTo } = registrationEmailSchema.parse(raw);
    const redirect = redirectUrl(returnTo);
    await assertEmailConfirmationEnabled();
    await authRequest(`resend?redirect_to=${encodeURIComponent(redirect)}`, { type: 'signup', email });
    return { message: confirmationMessage };
  }
};
