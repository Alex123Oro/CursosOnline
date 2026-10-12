import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAdmin, requireParticipant } from '../../shared/auth.js';
import { enrollmentController } from './enrollment.controller.js';

export const enrollmentRoutes = Router();

enrollmentRoutes.get('/', requireAdmin, asyncHandler(enrollmentController.list));
enrollmentRoutes.post('/:courseId/preenroll', requireParticipant, asyncHandler(enrollmentController.preenroll));
enrollmentRoutes.patch('/:id/scholarship', requireAdmin, asyncHandler(enrollmentController.assignScholarship));
enrollmentRoutes.delete('/:id/scholarship', requireAdmin, asyncHandler(enrollmentController.deactivateScholarship));
enrollmentRoutes.post('/:id/payments', requireAdmin, asyncHandler(enrollmentController.registerPayment));
enrollmentRoutes.post('/:id/confirm', requireAdmin, asyncHandler(enrollmentController.confirm));
