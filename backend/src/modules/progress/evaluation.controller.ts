import type { Request, Response } from 'express';
import { z } from 'zod';
import { currentUser } from '../../shared/auth.js';
import { parsePositiveInt } from '../courses/course.rules.js';
import { evaluationService } from './evaluation.service.js';

const evaluationSchema = z.object({
  title: z.string().trim().min(2),
  maxScore: z.coerce.number().positive().max(100),
  weight: z.coerce.number().positive().max(100)
});

const gradeSchema = z.object({
  score: z.coerce.number().min(0).max(100),
  comment: z.string().trim().max(1000).optional()
});

export const evaluationController = {
  async list(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.courseId, 'El identificador del curso no es válido.');
    response.json(await evaluationService.list(courseId, currentUser(request)));
  },

  async create(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.courseId, 'El identificador del curso no es válido.');
    response.status(201).json(await evaluationService.create(courseId, evaluationSchema.parse(request.body), currentUser(request)));
  },

  async recordGrade(request: Request, response: Response) {
    const courseId = parsePositiveInt(request.params.courseId, 'El identificador del curso no es válido.');
    const evaluationId = parsePositiveInt(request.params.evaluationId, 'El identificador de la evaluación no es válido.');
    const enrollmentId = parsePositiveInt(request.params.enrollmentId, 'El identificador de la inscripción no es válido.');
    response.json(await evaluationService.recordGrade(courseId, evaluationId, enrollmentId, gradeSchema.parse(request.body), currentUser(request)));
  }
};
