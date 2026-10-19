import type { Request, Response } from 'express';
import { currentUser } from '../../shared/auth.js';
import { parsePositiveInt } from '../courses/course.rules.js';
import { attendanceInputSchema } from './attendance.rules.js';
import { attendanceService } from './attendance.service.js';

export const attendanceController = {
  async list(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.courseId, 'El identificador del curso no es válido.');
    response.json(await attendanceService.list(courseId, currentUser(request)));
  },

  async save(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.courseId, 'El identificador del curso no es válido.');
    const sessionId = parsePositiveInt(request.params.sessionId, 'El identificador de la sesión no es válido.');
    const enrollmentId = parsePositiveInt(request.params.enrollmentId, 'El identificador de inscripción no es válido.');
    const { status } = attendanceInputSchema.parse(request.body);
    response.json(await attendanceService.save(courseId, sessionId, enrollmentId, status, currentUser(request)));
  }
};
