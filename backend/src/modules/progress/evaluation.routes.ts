import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireUser } from '../../shared/auth.js';
import { evaluationController } from './evaluation.controller.js';

export const evaluationRoutes = Router();

evaluationRoutes.get('/:courseId/evaluations', requireUser, asyncHandler(evaluationController.list));
evaluationRoutes.post('/:courseId/evaluations', requireUser, asyncHandler(evaluationController.create));
evaluationRoutes.put('/:courseId/evaluations/:evaluationId/grades/:enrollmentId', requireUser, asyncHandler(evaluationController.recordGrade));