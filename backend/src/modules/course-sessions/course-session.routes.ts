import { Router } from 'express';
import { requireAdmin, requireUser } from '../../shared/auth.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { courseSessionController } from './course-session.controller.js';

export const courseSessionRoutes = Router();
courseSessionRoutes.get('/:courseId/sessions', requireUser, asyncHandler(courseSessionController.list));
courseSessionRoutes.post('/:courseId/sessions', requireAdmin, asyncHandler(courseSessionController.create));
courseSessionRoutes.post('/:courseId/sessions/schedule', requireAdmin, asyncHandler(courseSessionController.schedule));
courseSessionRoutes.put('/:courseId/sessions/:sessionId', requireAdmin, asyncHandler(courseSessionController.update));
export const teachingRoutes = Router();
teachingRoutes.get('/courses', requireUser, asyncHandler(courseSessionController.teachingCourses));
