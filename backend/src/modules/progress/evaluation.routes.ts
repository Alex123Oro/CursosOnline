import { Router } from 'express';
import { requireUser } from '../../shared/auth.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { evaluationController } from './evaluation.controller.js';

export const evaluationRoutes = Router();
evaluationRoutes.get('/:courseId/evaluations', requireUser, asyncHandler(evaluationController.list));
evaluationRoutes.post('/:courseId/evaluations', requireUser, asyncHandler(evaluationController.create));
evaluationRoutes.put('/:courseId/evaluations/:evaluationId', requireUser, asyncHandler(evaluationController.update));
evaluationRoutes.delete('/:courseId/evaluations/:evaluationId', requireUser, asyncHandler(evaluationController.remove));
evaluationRoutes.put('/:courseId/evaluations/:evaluationId/grades/:enrollmentId', requireUser, asyncHandler(evaluationController.recordGrade));
