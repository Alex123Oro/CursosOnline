import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error.js';
import { courseInputSchema } from './course.rules.js';
import { courseService } from './course.service.js';

export const courseController = {
  async list(_request: Request, response: Response) {
    const courses = await courseService.list();
    response.json(courses);
  },

  async create(request: Request, response: Response) {
    const input = courseInputSchema.parse(request.body);
    const course = await courseService.create(input);
    response.status(201).json(course);
  },

  async update(request: Request, response: Response) {
    const rawId = request.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new HttpError(400, 'El identificador del curso es obligatorio.');
    }

    const courseId = Number(id);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      throw new HttpError(400, 'El identificador del curso no es valido.');
    }

    const input = courseInputSchema.parse(request.body);
    const course = await courseService.update(courseId, input);
    response.json(course);
  }
};
