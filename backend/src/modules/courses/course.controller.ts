import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error.js';
import { courseInputSchema, coursePricesSchema, parsePositiveInt } from './course.rules.js';
import { courseService } from './course.service.js';

export const courseController = {
  /**
   * Retorna todos los cursos para la administración.
   */
  async list(_request: Request, response: Response) {
    const courses = await courseService.list();
    response.json(courses);
  },

  /**
   * Retorna solo los cursos publicados para el catálogo público.
   */
  async catalog(_request: Request, response: Response) {
    const courses = await courseService.catalog();
    response.json(courses);
  },

  async catalogDetail(request: Request, response: Response) {
    const rawId = request.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const courseId = Number(id);
    if (!Number.isInteger(courseId) || courseId <= 0) throw new HttpError(400, 'El identificador del curso no es valido.');
    const user = (request as Request & { user?: { id: number; role: string } }).user;
    const course = await courseService.catalogById(courseId, user?.role === 'PARTICIPANT' ? user.id : undefined);
    if (!course) throw new HttpError(404, 'Curso no encontrado.');
    response.json(course);
  },

  /**
   * Crea un curso nuevo.
   */
  async create(request: Request, response: Response) {
    const input = courseInputSchema.parse(request.body);
    const course = await courseService.create(input);
    response.status(201).json(course);
  },

  /**
   * Actualiza la información del curso.
   */
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
  },

  /**
   * Publica un curso cuando cumple con los requisitos mínimos.
   */
  async publish(request: Request, response: Response) {
    const rawId = request.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new HttpError(400, 'El identificador del curso es obligatorio.');
    }

    const courseId = Number(id);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      throw new HttpError(400, 'El identificador del curso no es valido.');
    }

    const course = await courseService.publish(courseId);
    response.json(course);
  },

  async replacePrices(request: Request, response: Response) {
    const id = parsePositiveInt(request.params.id, 'El identificador del curso no es válido.');
    const input = coursePricesSchema.parse(request.body);
    response.json(await courseService.replacePrices(id, input.items));
  },
  async unpublish(request: Request, response: Response) {
    const id = parsePositiveInt(request.params.id, 'El identificador del curso no es válido.');
    response.json(await courseService.unpublish(id));
  }
};
