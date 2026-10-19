import type { Request, Response } from 'express';
import { currentUser } from '../../shared/auth.js';
import { parsePositiveInt } from '../courses/course.rules.js';
import { sessionInputSchema, recurrenceInputSchema } from './course-session.rules.js';
import { courseSessionService } from './course-session.service.js';

const getCourseId = (request: Request) =>
  parsePositiveInt(request.params.courseId, 'El identificador del curso no es válido.');

const getSessionId = (request: Request) =>
  parsePositiveInt(request.params.sessionId, 'El identificador de la sesión no es válido.');

export const courseSessionController = {
  async teachingCourses(request: Request, response: Response) {
    response.json(await courseSessionService.teachingCourses(currentUser(request)));
  },

  async list(request: Request, response: Response) {
    response.json(await courseSessionService.list(getCourseId(request), currentUser(request)));
  },

  async create(request: Request, response: Response) {
    const input = sessionInputSchema.parse(request.body);
    response.status(201).json(await courseSessionService.create(getCourseId(request), input, currentUser(request)));
  },

  async schedule(request: Request, response: Response) {
    const input = recurrenceInputSchema.parse(request.body);
    response.status(201).json(await courseSessionService.schedule(getCourseId(request), input, currentUser(request)));
  },

  async update(request: Request, response: Response) {
    const input = sessionInputSchema.parse(request.body);
    response.json(await courseSessionService.update(getCourseId(request), getSessionId(request), input, currentUser(request)));
  },

  async remove(request: Request, response: Response) {
    await courseSessionService.remove(getCourseId(request), getSessionId(request), currentUser(request));
    response.status(204).send();
  }
};
