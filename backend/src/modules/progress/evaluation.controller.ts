import type { Request, Response } from 'express';
import { z } from 'zod';
import { currentUser } from '../../shared/auth.js';
import { parsePositiveInt } from '../courses/course.rules.js';
import { evaluationService } from './evaluation.service.js';

const evaluationSchema = z.object({
  title: z.string().trim().min(2).max(200),
  maxScore: z.coerce.number().positive().max(100),
  weight: z.coerce.number().positive().max(100)
}).strict();

const gradeSchema = z.object({
  score: z.coerce.number().min(0).max(100),
  comment: z.string().trim().max(1000).optional()
}).strict();

const courseIdFrom = (request: Request) => parsePositiveInt(request.params.courseId, 'El identificador del curso no es válido.');
const evaluationIdFrom = (request: Request) => parsePositiveInt(request.params.evaluationId, 'El identificador de la evaluación no es válido.');

export const evaluationController = {
  async list(request: Request, response: Response) {
    response.json(await evaluationService.list(courseIdFrom(request), currentUser(request)));
  },
  async create(request: Request, response: Response) {
    response.status(201).json(await evaluationService.create(courseIdFrom(request), evaluationSchema.parse(request.body), currentUser(request)));
  },
  async update(request: Request, response: Response) {
    response.json(await evaluationService.update(courseIdFrom(request), evaluationIdFrom(request), evaluationSchema.parse(request.body), currentUser(request)));
  },
  async remove(request: Request, response: Response) {
    await evaluationService.remove(courseIdFrom(request), evaluationIdFrom(request), currentUser(request));
    response.status(204).send();
  },
  async recordGrade(request: Request, response: Response) {
    const enrollmentId = parsePositiveInt(request.params.enrollmentId, 'El identificador de la inscripción no es válido.');
    response.json(await evaluationService.recordGrade(courseIdFrom(request), evaluationIdFrom(request), enrollmentId, gradeSchema.parse(request.body), currentUser(request)));
  }
};
