import type { Request, Response } from 'express';
import { currentUser } from '../../shared/auth.js';
import { parsePositiveInt } from '../courses/course.rules.js';
import { progressService } from './progress.service.js';

export const progressController = {
  async mine(request: Request, response: Response) {
    response.json(await progressService.listForParticipant(currentUser(request).id));
  },
  async results(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.courseId, 'El identificador del curso no es válido.');
    response.json(await progressService.listCourseResults(courseId, currentUser(request)));
  },
  async calculate(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.courseId, 'El identificador del curso no es válido.');
    response.json(await progressService.calculateCourseResults(courseId, currentUser(request)));
  }
};
