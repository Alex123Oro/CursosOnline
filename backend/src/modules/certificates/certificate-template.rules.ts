import { z } from 'zod';
const text = (max: number) => z.string().trim().max(max).refine(value => /^[\x20-\x7E\u00A0-\u00FF\u2013-\u2014\u2018-\u201D\u2022\u2026\u20AC]*$/.test(value), 'Usa texto latino sin emojis ni saltos de línea.');
const image = (max = 60000) => z.string().max(max).refine(value => {
  if (!value) return true;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2]!, 'base64');
  return match[1] === 'png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}, 'Selecciona una imagen PNG o JPEG válida.');
export const certificateTemplateConfigSchema = z.strictObject({
  institution: text(85).min(1), department: text(85), title: text(50).min(1), intro: text(180).min(1), reason: text(180).min(1),
  signatoryName: text(80), signatoryRole: text(80), footer: text(140),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font: z.enum(['serif','sans']), layout: z.enum(['classic','modern']), logo: image(), signature: image(),
  backgroundImage: image(1500000).default(''), backgroundName: z.string().max(150).default(''), showTemplateText: z.boolean().default(true)
});
export type CertificateTemplateConfig = z.infer<typeof certificateTemplateConfigSchema>;
export const certificateTemplateInputSchema = z.strictObject({ name: text(100).min(3), type: z.enum(['aprobacion','participacion']), config: certificateTemplateConfigSchema });
export const certificateTemplateUpdateSchema = certificateTemplateInputSchema.extend({ version: z.number().int().positive() });
export const certificateTemplateSnapshotSchema = z.object({ id: z.string(), name: z.string(), version: z.number().int().positive(), config: certificateTemplateConfigSchema });
export const defaultCertificateTemplate = (type: 'aprobacion' | 'participacion'): CertificateTemplateConfig => ({
  institution:'EVA · Formación continua', department:'Laboratorio de Informática', title:'CERTIFICADO', intro:'Se otorga el presente certificado a',
  reason:type === 'aprobacion' ? 'por haber aprobado satisfactoriamente el curso' : 'por su participación en el curso',
  signatoryName:'Autoridad institucional', signatoryRole:'Formación continua', footer:'Documento electrónico de formación continua.',
  primaryColor:'#064542', accentColor:'#A8854D', backgroundColor:'#FCF9F3', font:'serif', layout:'classic', logo:'', signature:'',backgroundImage:'',backgroundName:'',showTemplateText:true
});
