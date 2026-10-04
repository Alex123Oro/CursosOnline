import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireUser } from '../../shared/auth.js';
import { sessionController } from './session.controller.js';

export const sessionRoutes = Router();

sessionRoutes.get('/users', asyncHandler(sessionController.listUsers));
sessionRoutes.get('/me', requireUser, asyncHandler(sessionController.me));
