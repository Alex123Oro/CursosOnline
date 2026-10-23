import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../../shared/http-error.js';
import { authService } from './auth.service.js';
import { registrationService } from './registration.service.js';

const credentialsSchema = z.object({
  email: z.string().trim().email('Ingresa un correo valido.'),
  password: z.string().min(1, 'La contraseña es obligatoria.')
});

const bearerToken = (request: Request) => {
  const match = request.header('authorization')?.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, 'Debe identificarse para continuar.');
  return match[1] ?? '';
};

export const authController = {
  async register(request: Request, response: Response) {
    response.status(202).json(await registrationService.register(request.body));
  },

  async resend(request: Request, response: Response) {
    response.status(202).json(await registrationService.resend(request.body));
  },

  async confirmEmail(request: Request, response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const input = z.object({ refreshToken: z.string().min(1).max(4096).optional() }).parse(request.body ?? {});
    response.json(await authService.confirmEmail(bearerToken(request), input.refreshToken));
  },

  async login(request: Request, response: Response) {
    const credentials = credentialsSchema.parse(request.body);
    response.json(await authService.login(credentials.email, credentials.password));
  },

  async refresh(request: Request, response: Response) {
    const input = z.object({ refreshToken: z.string().min(1).max(4096) }).strict().parse(request.body);
    response.setHeader('Cache-Control', 'no-store');
    response.json(await authService.refresh(input.refreshToken));
  },

  async logout(request: Request, response: Response) {
    await authService.logout(bearerToken(request));
    response.status(204).end();
  }
};
