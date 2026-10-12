import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireParticipant } from '../../shared/auth.js';
import { progressController } from './progress.controller.js';

export const progressRoutes = Router();

progressRoutes.get('/me', requireParticipant, asyncHandler(progressController.mine));