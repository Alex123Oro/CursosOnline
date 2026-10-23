import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireUser } from '../../shared/auth.js';
import { authController } from './auth.controller.js';

export const authRoutes = Router();

const registrationLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message: 'Demasiadas solicitudes. Espera unos minutos e inténtalo nuevamente.' }
});

authRoutes.post('/register', registrationLimit, asyncHandler(authController.register));
authRoutes.post('/resend-confirmation', registrationLimit, asyncHandler(authController.resend));
authRoutes.post('/confirm-email', registrationLimit, asyncHandler(authController.confirmEmail));

authRoutes.post('/login', asyncHandler(authController.login));
authRoutes.post('/refresh', rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message: 'Espera un momento antes de renovar la sesión.' } }), asyncHandler(authController.refresh));
authRoutes.post('/logout', requireUser, asyncHandler(authController.logout));
