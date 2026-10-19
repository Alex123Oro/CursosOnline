import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { certificateTemplateInputSchema, defaultCertificateTemplate } from '../src/modules/certificates/certificate-template.rules.js';
import { certificatePdfService } from '../src/modules/certificates/certificate-pdf.service.js';
import { generateTemplatePreview } from '../src/modules/certificates/certificate-template-pdf.js';
import QRCode from 'qrcode';
describe('certificate templates',()=>{
  it('keeps older saved templates compatible and rejects unsafe imported backgrounds',()=>{
    const {backgroundImage,backgroundName,showTemplateText,...oldConfig}=defaultCertificateTemplate('aprobacion');
    const input={name:'Importada',type:'aprobacion',config:oldConfig};
    expect(certificateTemplateInputSchema.parse(input).config).toMatchObject({backgroundImage:'',showTemplateText:true});
    for(const backgroundImage of ['data:application/pdf;base64,JVBERg==','data:image/svg+xml,<svg/>','x'.repeat(1500001)]){
      expect(certificateTemplateInputSchema.safeParse({...input,config:{...oldConfig,backgroundImage}}).success).toBe(false);
    }
  });
  it('uses the imported background in preview and PDF while avoiding duplicate institutional text',async()=>{
    const image=await QRCode.toBuffer('Imported certificate background');
    const config={...defaultCertificateTemplate('aprobacion'),backgroundImage:`data:image/png;base64,${image.toString('base64')}`,backgroundName:'institucional.pdf',showTemplateText:false};
    const certificate={id:'0',code:'00000000',participantName:'Ana Alvarez',courseName:'Curso importado',durationHours:24,type:'aprobacion' as const,issuedAt:'2026-10-16T12:00:00Z',status:'VALID' as const,publicUrl:'https://example.com/verificar/00000000',demo:true,template:{id:'1',name:'Importada',version:1,config}};
    const svg=await generateTemplatePreview(certificate);
    expect(svg).toContain(config.backgroundImage);expect(svg).toContain('Ana Alvarez');expect(svg).toContain('Curso importado');expect(svg).not.toContain(config.institution);
    const pdf=await PDFDocument.load(await certificatePdfService.generate(certificate));expect(pdf.getPageCount()).toBe(1);
    config.showTemplateText=true;expect(await generateTemplatePreview(certificate)).toContain(config.institution);
  });
  it('renders a browser-safe preview using the PDF layout coordinates',async()=>{
    const svg=await generateTemplatePreview({id:'0',code:'00000000',participantName:'Ana & Luis',courseName:'Curso <web>',durationHours:24,type:'aprobacion',issuedAt:'2026-10-16T12:00:00Z',status:'VALID',publicUrl:'https://example.com/verificar/00000000',demo:true,template:{id:'1',name:'Institucional',version:1,config:defaultCertificateTemplate('aprobacion')}});
    expect(svg).toContain('viewBox="0 0 842 595"');expect(svg).toContain('Ana &amp; Luis');expect(svg).toContain('Curso &lt;web&gt;');expect(svg).toContain('data:image/png;base64,');expect(svg).toContain('Documento electrónico de formación continua.');
  });
  it('rejects active content, malformed colors and unsupported template text',()=>{
    const valid={name:'Institucional',type:'aprobacion',config:defaultCertificateTemplate('aprobacion')};
    expect(certificateTemplateInputSchema.safeParse(valid).success).toBe(true);
    for(const config of [{...valid.config,logo:'data:image/svg+xml,<svg/>'},{...valid.config,primaryColor:'red'},{...valid.config,institution:'Nombre 😀'},{...valid.config,font:'custom'}]){
      expect(certificateTemplateInputSchema.safeParse({...valid,config}).success).toBe(false);
    }
  });
  it.each(['classic','modern'] as const)('renders the snapshotted %s layout into a landscape PDF',async layout=>{
    const config={...defaultCertificateTemplate('participacion'),institution:'Instituto de Formación',layout};
    const bytes=await certificatePdfService.generate({id:'7',code:'8F72A91C',participantName:'Ana Álvarez',courseName:'Desarrollo de aplicaciones',durationHours:24,
      type:'participacion',issuedAt:'2026-10-16T12:00:00Z',status:'VALID',publicUrl:'https://example.com/verificar/8F72A91C',demo:true,template:{id:'2',name:'Participación',version:3,config}});
    const pdf=await PDFDocument.load(bytes);expect(pdf.getAuthor()).toBe('Instituto de Formación');expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight());expect(pdf.getPage(0).node.Resources()?.toString()).toContain('Image');
  });
});
