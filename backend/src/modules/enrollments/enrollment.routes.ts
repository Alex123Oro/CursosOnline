import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAdmin } from '../../shared/auth.js';
import { enrollmentController } from './enrollment.controller.js';

export const enrollmentRoutes = Router();

enrollmentRoutes.get('/', requireAdmin, asyncHandler(enrollmentController.list));
enrollmentRoutes.patch('/:id/scholarship', requireAdmin, asyncHandler(enrollmentController.assignScholarship));
enrollmentRoutes.post('/:id/payments', requireAdmin, asyncHandler(enrollmentController.registerPayment));
enrollmentRoutes.post('/:id/confirm', requireAdmin, asyncHandler(enrollmentController.confirm));
