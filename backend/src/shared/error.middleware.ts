import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './http-error.js';

export const errorMiddleware: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      message: error.message,
      fields: error.fields ?? []
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      message: 'Datos invalidos para registrar el curso.',
      fields: error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message
      }))
    });
    return;
  }

  console.error(error);
  response.status(500).json({ message: 'Ocurrio un error inesperado.' });
};
