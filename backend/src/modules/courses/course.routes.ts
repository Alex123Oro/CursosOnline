import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { courseController } from './course.controller.js';

export const courseRoutes = Router();

courseRoutes.get('/', asyncHandler(courseController.list));
courseRoutes.post('/', asyncHandler(courseController.create));
courseRoutes.put('/:id', asyncHandler(courseController.update));
