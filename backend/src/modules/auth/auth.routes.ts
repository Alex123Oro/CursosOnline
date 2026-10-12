import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireUser } from '../../shared/auth.js';
import { authController } from './auth.controller.js';

export const authRoutes = Router();

authRoutes.post('/login', asyncHandler(authController.login));
authRoutes.post('/logout', requireUser, asyncHandler(authController.logout));