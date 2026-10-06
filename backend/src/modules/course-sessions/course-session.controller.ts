import type { Request, Response } from 'express';
import { currentUser } from '../../shared/auth.js';
import { parsePositiveInt } from '../courses/course.rules.js';
import { sessionInputSchema, recurrenceInputSchema } from './course-session.rules.js';
import { courseSessionService } from './course-session.service.js';

const courseId = (request: Request) => parsePositiveInt(request.params.courseId, 'El identificador del curso no es válido.');
export const courseSessionController = {
  async schedule(request: Request, response: Response) { response.status(201).json(await courseSessionService.schedule(courseId(request), recurrenceInputSchema.parse(request.body), currentUser(request))); },
  async teachingCourses(request: Request, response: Response) { response.json(await courseSessionService.teachingCourses(currentUser(request))); },
  async list(request: Request, response: Response) { response.json(await courseSessionService.list(courseId(request), currentUser(request))); },
  async create(request: Request, response: Response) { response.status(201).json(await courseSessionService.create(courseId(request), sessionInputSchema.parse(request.body), currentUser(request))); },
  async update(request: Request, response: Response) {
    const id = parsePositiveInt(request.params.sessionId, 'El identificador de la sesión no es válido.');
    response.json(await courseSessionService.update(courseId(request), id, sessionInputSchema.parse(request.body), currentUser(request)));
  }
};
