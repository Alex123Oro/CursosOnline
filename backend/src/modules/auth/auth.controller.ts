import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../../shared/http-error.js';
import { authService } from './auth.service.js';

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
  async login(request: Request, response: Response) {
    const credentials = credentialsSchema.parse(request.body);
    response.json(await authService.login(credentials.email, credentials.password));
  },

  async logout(request: Request, response: Response) {
    await authService.logout(bearerToken(request));
    response.status(204).end();
  }
};