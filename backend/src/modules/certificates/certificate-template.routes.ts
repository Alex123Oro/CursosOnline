import { Router } from 'express';
import { requireCertificateRole, certificateUser } from './certificate.auth.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { certificateIdSchema } from './certificate.rules.js';
import { certificateTemplateInputSchema, certificateTemplateUpdateSchema } from './certificate-template.rules.js';
import { certificateTemplateService } from './certificate-template.service.js';
import { certificatePdfService } from './certificate-pdf.service.js';
import { certificateLink } from './certificate-link.js';
import { generateTemplatePreview } from './certificate-template-pdf.js';
export const certificateTemplateRoutes = Router();
certificateTemplateRoutes.use(requireCertificateRole('ADMIN'));
certificateTemplateRoutes.get('/', asyncHandler(async (_request,response) => { response.json(await certificateTemplateService.list()); }));
certificateTemplateRoutes.post('/preview-image', asyncHandler(async (request,response) => {
  const input=certificateTemplateInputSchema.parse(request.body);
  const image=await generateTemplatePreview({id:'0',code:'00000000',participantName:'Nombre del participante',courseName:'Nombre del curso de formación continua',durationHours:24,type:input.type,issuedAt:new Date().toISOString(),status:'VALID',publicUrl:certificateLink('00000000'),demo:true,template:{id:'0',name:input.name,version:1,config:input.config}});
  response.set('Cache-Control','no-store').type('image/svg+xml').send(image);
}));
certificateTemplateRoutes.post('/preview', asyncHandler(async (request,response) => {
  const input = certificateTemplateInputSchema.parse(request.body);
  const pdf = await certificatePdfService.generate({ id:'0',code:'00000000',participantName:'Nombre del participante',courseName:'Nombre del curso de formación continua',durationHours:24,
    type:input.type,issuedAt:new Date().toISOString(),status:'VALID',publicUrl:certificateLink('00000000'),demo:true,
    template:{id:'0',name:input.name,version:1,config:input.config} });
  response.set('Cache-Control','no-store').type('application/pdf').send(pdf);
}));
certificateTemplateRoutes.post('/', asyncHandler(async (request,response) => { response.status(201).json(await certificateTemplateService.create(certificateTemplateInputSchema.parse(request.body),certificateUser(request).id)); }));
certificateTemplateRoutes.put('/:id', asyncHandler(async (request,response) => { response.json(await certificateTemplateService.update(certificateIdSchema.parse(request.params.id),certificateTemplateUpdateSchema.parse(request.body),certificateUser(request).id)); }));
