import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireParticipant, requireUser } from '../../shared/auth.js';
import { progressController } from './progress.controller.js';

export const progressRoutes = Router();
progressRoutes.get('/me', requireParticipant, asyncHandler(progressController.mine));
progressRoutes.get('/courses/:courseId/results', requireUser, asyncHandler(progressController.results));
progressRoutes.post('/courses/:courseId/results/calculate', requireUser, asyncHandler(progressController.calculate));
