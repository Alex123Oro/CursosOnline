import type { Request, Response } from 'express';
import { currentUser } from '../../shared/auth.js';
import { parsePositiveInt, paymentSchema, scholarshipSchema } from '../courses/course.rules.js';
import { enrollmentService } from './enrollment.service.js';
import { enrollmentQuerySchema } from './enrollment-query.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
const closeSchema = z.object({ reason: z.string().trim().min(5).max(500) }).strict();
const movementSchema = z.object({ kind: z.enum(['ABONO', 'DEVOLUCION', 'AJUSTE']), amount: z.number().finite().min(-99999999).max(99999999),
  reason: z.string().trim().min(5).max(500), reference: z.string().trim().max(100).optional(), requestId: z.string().uuid() }).strict();

export const enrollmentController = {
  async mine(request: Request, response: Response) { response.json(await enrollmentService.mine(currentUser(request))); },
  async expire(_request: Request, response: Response) { response.json(await enrollmentService.expire()); },
  async cancel(request: Request, response: Response) {
    response.json(await enrollmentService.close(parsePositiveInt(request.params.id, 'Inscripción inválida.'), 'CANCELADO', closeSchema.parse(request.body).reason, currentUser(request)));
  },
  async reject(request: Request, response: Response) {
    response.json(await enrollmentService.close(parsePositiveInt(request.params.id, 'Inscripción inválida.'), 'RECHAZADO', closeSchema.parse(request.body).reason, currentUser(request)));
  },
  async movement(request: Request, response: Response) {
    response.json(await enrollmentService.movement(parsePositiveInt(request.params.id, 'Inscripción inválida.'), movementSchema.parse(request.body), currentUser(request).id));
  },
  async list(request: Request, response: Response) {
    response.json(Object.keys(request.query).length
      ? await enrollmentService.listPage(enrollmentQuerySchema.parse(request.query))
      : await enrollmentService.list());
  },
  async courses(_request: Request, response: Response) { response.json(await enrollmentService.courseSummaries()); },
  async detail(request: Request, response: Response) {
    const id = parsePositiveInt(request.params.id, 'El identificador de la inscripción no es válido.');
    response.json(await enrollmentService.detail(id));
  },

  async preenroll(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.courseId ?? request.params.id, 'El identificador del curso no es valido.');
    const enrollment = await enrollmentService.preenroll(courseId, currentUser(request));
    response.status(201).json(enrollment);
  },

  async assignScholarship(request: Request, response: Response) {
    const id = parsePositiveInt(request.params.id, 'El identificador de la inscripcion no es valido.');
    const input = scholarshipSchema.parse(request.body);
    response.json(await enrollmentService.assignScholarship(id, input.scholarshipPercent, input.reason));
  },

  async deactivateScholarship(request: Request, response: Response) {
    const id = parsePositiveInt(request.params.id, 'El identificador de la inscripción no es válido.');
    response.json(await enrollmentService.deactivateScholarship(id));
  },

  async registerPayment(request: Request, response: Response) {
    const id = parsePositiveInt(request.params.id, 'El identificador de la inscripcion no es valido.');
    const input = paymentSchema.extend({ requestId: z.string().uuid().optional(), reason: z.string().trim().min(5).max(500).optional(), reference: z.string().trim().max(100).optional() }).parse(request.body ?? {});
    response.json(await enrollmentService.registerPayment(id, input.amount, currentUser(request).id, input.requestId ?? randomUUID(), input.reason, input.reference));
  },

  async confirm(request: Request, response: Response) {
    const id = parsePositiveInt(request.params.id, 'El identificador de la inscripcion no es valido.');
    response.json(await enrollmentService.confirm(id, currentUser(request).id));
  }
};
