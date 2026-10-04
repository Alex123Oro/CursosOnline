import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { participantTypeController } from './participant-type.controller.js';

export const participantTypeRoutes = Router();

participantTypeRoutes.get('/', asyncHandler(participantTypeController.list));
