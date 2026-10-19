import { Router } from 'express';
import { requireAdmin } from '../../shared/auth.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { HttpError } from '../../shared/http-error.js';
import { instructorInputSchema, assignInstructorSchema, updateAssignmentSchema } from './instructor.rules.js';
import { instructorService } from './instructor.service.js';

export const instructorRoutes = Router();

const positiveId = (raw: unknown, label: string): number => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) <= 0 || !Number.isSafeInteger(Number(value))) {
    throw new HttpError(400, `${label} no es válido.`);
  }
  return Number(value);
};

instructorRoutes.post('/instructors', requireAdmin, asyncHandler(async (request, response) => {
  const instructor = await instructorService.create(instructorInputSchema.parse(request.body));
  response.status(201).json(instructor);
}));

// Rutas exclusivas de administración; no se exponen acciones sin autenticación.
instructorRoutes.get('/instructor-assignments', requireAdmin, asyncHandler(async (request, response) => {
  const courseId = request.query.courseId === undefined ? undefined : positiveId(request.query.courseId, 'El curso');
  response.json(await instructorService.assignments(courseId));
}));

instructorRoutes.post('/instructor-assignments', requireAdmin, asyncHandler(async (request, response) => {
  const input = assignInstructorSchema.parse(request.body);
  const actor = (request as typeof request & { user?: { id: number } }).user;
  response.status(201).json(await instructorService.assign(input.courseId, input.instructorId, actor?.id));
}));

instructorRoutes.put('/instructor-assignments/:id', requireAdmin, asyncHandler(async (request, response) => {
  const id = positiveId(request.params.id, 'La asignación');
  const input = updateAssignmentSchema.parse(request.body);
  response.json(await instructorService.changeAssignment(id, input.instructorId));
}));

instructorRoutes.delete('/instructor-assignments/:id', requireAdmin, asyncHandler(async (request, response) => {
  const id = positiveId(request.params.id, 'La asignación');
  response.json(await instructorService.removeAssignment(id));
}));
