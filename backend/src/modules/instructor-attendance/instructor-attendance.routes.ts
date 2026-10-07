import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { currentUser, requireUser } from '../../shared/auth.js';
import { parsePositiveInt } from '../courses/course.rules.js';
import { attendanceInputSchema } from '../attendance/attendance.rules.js';
import { instructorAttendanceFilters, requireAdministrator } from './instructor-attendance.rules.js';
import { instructorAttendanceService } from './instructor-attendance.service.js';
export const instructorAttendanceRoutes = Router();
instructorAttendanceRoutes.use(requireUser, (request, _response, next) => { try { requireAdministrator(currentUser(request)); next(); } catch (error) { next(error); } });
instructorAttendanceRoutes.get('/instructors', asyncHandler(async (request, response) => { response.json(await instructorAttendanceService.instructors(currentUser(request))); }));
instructorAttendanceRoutes.get('/instructors/:instructorId/attendance', asyncHandler(async (request, response) => {
  const id = parsePositiveInt(request.params.instructorId, 'El identificador del instructor no es válido.');
  response.json(await instructorAttendanceService.list(id, instructorAttendanceFilters.parse(request.query), currentUser(request)));
}));
instructorAttendanceRoutes.put('/instructors/:instructorId/sessions/:sessionId/attendance', asyncHandler(async (request, response) => {
  const instructorId = parsePositiveInt(request.params.instructorId, 'El identificador del instructor no es válido.');
  const sessionId = parsePositiveInt(request.params.sessionId, 'El identificador de la sesión no es válido.');
  const { status } = attendanceInputSchema.parse(request.body);
  response.json(await instructorAttendanceService.save(instructorId, sessionId, status, currentUser(request)));
}));
