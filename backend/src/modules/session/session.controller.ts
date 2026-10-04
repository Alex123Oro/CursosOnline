import type { Request, Response } from 'express';
import { sessionService } from './session.service.js';

export const sessionController = {
  async listUsers(_request: Request, response: Response) {
    response.json(await sessionService.listUsers());
  },

  async me(request: Request, response: Response) {
    response.json(sessionService.me(request));
  }
};
