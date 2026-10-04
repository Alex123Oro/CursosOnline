import type { Request, Response } from 'express';
import { currentUser } from '../../shared/auth.js';
import { parsePositiveInt, paymentSchema, scholarshipSchema } from '../courses/course.rules.js';
import { enrollmentService } from './enrollment.service.js';

export const enrollmentController = {
  async list(_request: Request, response: Response) {
    response.json(await enrollmentService.list());
  },

  async preenroll(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.courseId ?? request.params.id, 'El identificador del curso no es valido.');
    const enrollment = await enrollmentService.preenroll(courseId, currentUser(request));
    response.status(201).json(enrollment);
  },

  async assignScholarship(request: Request, response: Response) {
    const id = parsePositiveInt(request.params.id, 'El identificador de la inscripcion no es valido.');
    const input = scholarshipSchema.parse(request.body);
    response.json(await enrollmentService.assignScholarship(id, input.scholarshipPercent));
  },

  async registerPayment(request: Request, response: Response) {
    const id = parsePositiveInt(request.params.id, 'El identificador de la inscripcion no es valido.');
    const input = paymentSchema.parse(request.body ?? {});
    response.json(await enrollmentService.registerPayment(id, input.amount));
  },

  async confirm(request: Request, response: Response) {
    const id = parsePositiveInt(request.params.id, 'El identificador de la inscripcion no es valido.');
    response.json(await enrollmentService.confirm(id));
  }
};
