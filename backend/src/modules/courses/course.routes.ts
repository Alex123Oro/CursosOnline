import { Router, raw } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { optionalAuth, requireAdmin } from '../../shared/auth.js';
import { courseController } from './course.controller.js';
import { courseCoverService } from './course-cover.service.js';

export const courseRoutes = Router();

courseRoutes.post('/covers', requireAdmin,
  raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' }),
  asyncHandler(async (request, response) => {
    const actor = (request as typeof request & { user: { id: number } }).user;
    response.status(201).json(await courseCoverService.upload(request.body, request.header('content-type') ?? '', actor.id));
  })
);

courseRoutes.get('/', requireAdmin, asyncHandler(courseController.list));
courseRoutes.get('/catalog', asyncHandler(courseController.catalog));
courseRoutes.get('/catalog/:id', optionalAuth, asyncHandler(courseController.catalogDetail));
courseRoutes.get('/instructor/:instructorId', requireAdmin, asyncHandler(courseController.listByInstructor));
courseRoutes.post('/', requireAdmin, asyncHandler(courseController.create));
courseRoutes.put('/:id', requireAdmin, asyncHandler(courseController.update));
courseRoutes.patch('/:id/publish', requireAdmin, asyncHandler(courseController.publish));
courseRoutes.patch('/:id/unpublish', requireAdmin, asyncHandler(courseController.unpublish));
courseRoutes.put('/:id/prices', requireAdmin, asyncHandler(courseController.replacePrices));
