import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { courseController } from './course.controller.js';

export const courseRoutes = Router();

courseRoutes.get('/', asyncHandler(courseController.list));
courseRoutes.get('/catalog', asyncHandler(courseController.catalog));
courseRoutes.get('/catalog/:id', asyncHandler(courseController.catalogDetail));
courseRoutes.post('/', asyncHandler(courseController.create));
courseRoutes.put('/:id', asyncHandler(courseController.update));
courseRoutes.patch('/:id/publish', asyncHandler(courseController.publish));
