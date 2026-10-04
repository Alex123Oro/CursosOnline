import type { Request, Response } from 'express';
import { participantTypeService } from './participant-type.service.js';

export const participantTypeController = {
  async list(_request: Request, response: Response) {
    response.json(await participantTypeService.list());
  }
};
