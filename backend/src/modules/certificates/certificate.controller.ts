import type { Request, Response } from 'express';
import { certificateUser } from './certificate.auth.js';
import { certificateBulkSchema, certificateCodeSchema, certificateIdSchema, certificateInputSchema, certificateTypeSchema } from './certificate.rules.js';
import { certificateService } from './certificate.service.js';
import { certificatePdfService } from './certificate-pdf.service.js';
import { z } from 'zod';
const correctionSchema = z.object({ reason: z.string().trim().min(5).max(500) }).strict();
const reissueSchema = z.object({ reason: z.string().trim().min(5).max(500), type: certificateTypeSchema,
  templateId: certificateIdSchema.optional() }).strict();

export const certificateController = {
  async revoke(request: Request, response: Response) {
    response.json(await certificateService.revoke(certificateIdSchema.parse(request.params.id), certificateUser(request).id, correctionSchema.parse(request.body).reason));
  },
  async reissue(request: Request, response: Response) {
    const input = reissueSchema.parse(request.body);
    response.status(201).json(await certificateService.reissue(certificateIdSchema.parse(request.params.id), certificateUser(request).id, input.reason, input.type, input.templateId));
  },
  async courses(_request: Request, response: Response) { response.json(await certificateService.courses()); },
  async roster(request: Request, response: Response) {
    response.json(await certificateService.roster(certificateIdSchema.parse(request.params.courseId), certificateTypeSchema.parse(request.query.type ?? 'aprobacion')));
  },
  async issue(request: Request, response: Response) {
    const input = certificateInputSchema.parse(request.body);
    response.status(201).json(await certificateService.issue(input.enrollmentId, certificateUser(request).id, input.type, ...(input.templateId ? [input.templateId] : [])));
  },
  async bulk(request: Request, response: Response) {
    const { enrollmentIds, type, templateId } = certificateBulkSchema.parse(request.body);
    response.json(await certificateService.bulk(certificateIdSchema.parse(request.params.courseId), enrollmentIds, certificateUser(request).id, type, ...(templateId ? [templateId] : [])));
  },
  async verify(request: Request, response: Response) {
    response.json(await certificateService.verify(certificateCodeSchema.parse(request.params.code)));
  },
  async mine(request: Request, response: Response) { response.json(await certificateService.mine(certificateUser(request).id)); },
  async detail(request: Request, response: Response) {
    response.json(await certificateService.owned(certificateIdSchema.parse(request.params.id), certificateUser(request).id));
  },
  async download(request: Request, response: Response) {
    const certificate = await certificateService.downloadable(certificateIdSchema.parse(request.params.id), certificateUser(request).id);
    const pdf = await certificatePdfService.generate(certificate);
    const name = certificate.courseName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60);
    response.type('application/pdf').attachment(`certificado-${name}-${certificate.code}.pdf`).send(pdf);
  }
};
