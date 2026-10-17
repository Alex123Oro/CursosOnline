import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireCertificateRole } from './certificate.auth.js';
import { certificateController as controller } from './certificate.controller.js';
import { certificateVerificationLimiter } from './certificate-verification.middleware.js';

export const certificateRoutes = Router();
certificateRoutes.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
// Deliberately no optionalAuth: expired credentials must not block public checks.
certificateRoutes.get('/verify/:code', certificateVerificationLimiter, asyncHandler(controller.verify));
certificateRoutes.get('/courses', requireCertificateRole('ADMIN'), asyncHandler(controller.courses));
certificateRoutes.get('/me', requireCertificateRole('PARTICIPANT'), asyncHandler(controller.mine));
certificateRoutes.get('/me/:id/pdf', requireCertificateRole('PARTICIPANT'), asyncHandler(controller.download));
certificateRoutes.get('/me/:id', requireCertificateRole('PARTICIPANT'), asyncHandler(controller.detail));
certificateRoutes.post('/', requireCertificateRole('ADMIN'), asyncHandler(controller.issue));

export const courseCertificateRoutes = Router();
courseCertificateRoutes.get('/:courseId/certificates', requireCertificateRole('ADMIN'), asyncHandler(controller.roster));
courseCertificateRoutes.post('/:courseId/certificates/bulk', requireCertificateRole('ADMIN'), asyncHandler(controller.bulk));
