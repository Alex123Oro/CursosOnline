import type { Request, Response } from 'express';
import { currentUser } from '../../shared/auth.js';
import { progressService } from './progress.service.js';

export const progressController = {
  async mine(request: Request, response: Response) {
    response.json(await progressService.listForParticipant(currentUser(request).id));
  }
};