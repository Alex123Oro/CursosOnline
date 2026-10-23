import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAdmin, requireParticipant, requireUser } from '../../shared/auth.js';
import { enrollmentController } from './enrollment.controller.js';

export const enrollmentRoutes = Router();

enrollmentRoutes.get('/', requireAdmin, asyncHandler(enrollmentController.list));
enrollmentRoutes.get('/courses', requireAdmin, asyncHandler(enrollmentController.courses));
enrollmentRoutes.get('/mine', requireParticipant, asyncHandler(enrollmentController.mine));
enrollmentRoutes.post('/expire', requireAdmin, asyncHandler(enrollmentController.expire));
enrollmentRoutes.get('/:id', requireAdmin, asyncHandler(enrollmentController.detail));
enrollmentRoutes.post('/:courseId/preenroll', requireParticipant, asyncHandler(enrollmentController.preenroll));
enrollmentRoutes.patch('/:id/scholarship', requireAdmin, asyncHandler(enrollmentController.assignScholarship));
enrollmentRoutes.delete('/:id/scholarship', requireAdmin, asyncHandler(enrollmentController.deactivateScholarship));
enrollmentRoutes.post('/:id/payments', requireAdmin, asyncHandler(enrollmentController.registerPayment));
enrollmentRoutes.post('/:id/confirm', requireAdmin, asyncHandler(enrollmentController.confirm));
enrollmentRoutes.post('/:id/cancel', requireUser, asyncHandler(enrollmentController.cancel));
enrollmentRoutes.post('/:id/reject', requireAdmin, asyncHandler(enrollmentController.reject));
enrollmentRoutes.post('/:id/payment-movements', requireAdmin, asyncHandler(enrollmentController.movement));
