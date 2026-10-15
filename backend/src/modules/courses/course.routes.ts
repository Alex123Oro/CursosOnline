import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { optionalAuth, requireAdmin } from '../../shared/auth.js';
import { courseController } from './course.controller.js';

export const courseRoutes = Router();

courseRoutes.get('/', requireAdmin, asyncHandler(courseController.list));
courseRoutes.get('/catalog', asyncHandler(courseController.catalog));
courseRoutes.get('/catalog/:id', optionalAuth, asyncHandler(courseController.catalogDetail));
courseRoutes.post('/', requireAdmin, asyncHandler(courseController.create));
courseRoutes.put('/:id', requireAdmin, asyncHandler(courseController.update));
courseRoutes.patch('/:id/publish', requireAdmin, asyncHandler(courseController.publish));
courseRoutes.patch('/:id/unpublish', requireAdmin, asyncHandler(courseController.unpublish));
courseRoutes.put('/:id/prices', requireAdmin, asyncHandler(courseController.replacePrices));
