import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { currentUser, requireUser } from '../../shared/auth.js';
import { parsePositiveInt } from '../courses/course.rules.js';
import { attendanceInputSchema } from './attendance.rules.js';
import { attendanceService } from './attendance.service.js';

export const attendanceRoutes = Router();
attendanceRoutes.get('/:courseId/attendance', requireUser, asyncHandler(async (request, response) => {
  const courseId = parsePositiveInt(request.params.courseId, 'El identificador del curso no es válido.');
  response.json(await attendanceService.list(courseId, currentUser(request)));
}));
attendanceRoutes.put('/:courseId/sessions/:sessionId/attendance/:enrollmentId', requireUser, asyncHandler(async (request, response) => {
  const courseId = parsePositiveInt(request.params.courseId, 'El identificador del curso no es válido.');
  const sessionId = parsePositiveInt(request.params.sessionId, 'El identificador de la sesión no es válido.');
  const enrollmentId = parsePositiveInt(request.params.enrollmentId, 'El identificador de inscripción no es válido.');
  const { status } = attendanceInputSchema.parse(request.body);
  response.json(await attendanceService.save(courseId, sessionId, enrollmentId, status, currentUser(request)));
}));
