import { Router } from 'express';
import { requireAdmin } from '../../shared/auth.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { instructorInputSchema } from './instructor.rules.js';
import { instructorService } from './instructor.service.js';
export const instructorRoutes = Router();
instructorRoutes.post('/instructors', requireAdmin, asyncHandler(async (request, response) => {
  const instructor = await instructorService.create(instructorInputSchema.parse(request.body));
  response.status(201).json(instructor);
}));
