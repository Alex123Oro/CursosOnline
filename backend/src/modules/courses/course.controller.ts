import type { Request, Response } from 'express';
import { currentUser } from '../../shared/auth.js';
import { HttpError } from '../../shared/http-error.js';
import { courseInputSchema, coursePricesSchema, parsePositiveInt } from './course.rules.js';
import { courseService } from './course.service.js';
import { enrollmentService } from '../enrollments/enrollment.service.js';

export const courseController = {
  async list(_request: Request, response: Response) {
    response.json(await courseService.list());
  },

  async catalog(_request: Request, response: Response) {
    response.json(await courseService.catalog());
  },

  async catalogDetail(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.id, 'El identificador del curso no es valido.');
    const course = await courseService.catalogById(courseId, currentUserSafe(request));
    if (!course) {
      throw new HttpError(404, 'El curso no esta disponible.');
    }

    response.json(course);
  },

  async create(request: Request, response: Response) {
    const input = courseInputSchema.parse(request.body);
    const course = await courseService.create(input);
    response.status(201).json(course);
  },

  async update(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.id, 'El identificador del curso no es valido.');
    const input = courseInputSchema.parse(request.body);
    response.json(await courseService.update(courseId, input));
  },

  async publish(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.id, 'El identificador del curso no es valido.');
    response.json(await courseService.publish(courseId));
  },

  async replacePrices(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.id, 'El identificador del curso no es valido.');
    const input = coursePricesSchema.parse(request.body);
    response.json(await courseService.replacePrices(courseId, input));
  },

  async preenroll(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.id, 'El identificador del curso no es valido.');
    const enrollment = await enrollmentService.preenroll(courseId, currentUser(request));
    response.status(201).json(enrollment);
  }
};

const currentUserSafe = (request: Request) => {
  try {
    return currentUser(request);
  } catch {
    return null;
  }
};
