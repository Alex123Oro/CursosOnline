import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireUser } from '../../shared/auth.js';
import { attendanceController } from './attendance.controller.js';

export const attendanceRoutes = Router();

attendanceRoutes.get('/:courseId/attendance', requireUser, asyncHandler(attendanceController.list));
attendanceRoutes.put(
  '/:courseId/sessions/:sessionId/attendance/:enrollmentId',
  requireUser,
  asyncHandler(attendanceController.save)
);
