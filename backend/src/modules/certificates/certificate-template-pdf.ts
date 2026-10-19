import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from 'pdf-lib';
import QRCode from 'qrcode';
import type { Certificate } from './certificate.types.js';
import { isDemoCertificate, prepareCertificateSignature } from './certificate-signature.js';
import { HttpError } from '../../shared/http-error.js';

async function renderTemplate(certificate: Certificate): Promise<{ pdf: Buffer; svg: string }> {
  const template = certificate.template!;
  const config = template.config;
  const showText = config.showTemplateText !== false || !config.backgroundImage;
  const signature = await prepareCertificateSignature(certificate);
  const demo = isDemoCertificate(certificate);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificado ${certificate.code}`); pdf.setAuthor(config.institution);
  pdf.setSubject(demo ? 'Demostración sin validez académica' : `Certificado · ${template.name} · versión ${template.version}`);
  const page = pdf.addPage([842,595]);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const heading = config.font === 'serif' ? await pdf.embedFont(StandardFonts.TimesRoman) : bold;
  const color = (hex: string) => rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
  const ink = color(config.primaryColor), accent = color(config.accentColor), background = color(config.backgroundColor);
  const elements: string[] = [];
  const xml=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const css=(value:RGB)=>`rgb(${Math.round(value.red*255)},${Math.round(value.green*255)},${Math.round(value.blue*255)})`;
  const rectangle=(options:{x:number;y:number;width:number;height:number;color?:RGB;borderColor?:RGB;borderWidth?:number})=>{
    page.drawRectangle(options);
    elements.push(`<rect x="${options.x}" y="${595-options.y-options.height}" width="${options.width}" height="${options.height}" fill="${options.color?css(options.color):'none'}" stroke="${options.borderColor?css(options.borderColor):'none'}" stroke-width="${options.borderWidth??0}"/>`);
  };
  const draw = (value: string,x: number,y: number,size=10,font: PDFFont=sans,tint=ink) => {
    page.drawText(value,{x,y,size,font,color:tint});
    elements.push(`<text x="${x}" y="${595-y}" fill="${css(tint)}" font-size="${size}" font-family="${font===heading&&config.font==='serif'?'Times New Roman,serif':'Arial,sans-serif'}" font-weight="${font===bold?'700':'400'}">${xml(value)}</text>`);
  };
  const fit = (text: string,x: number,y: number,width: number,maxSize: number,maxLines=1,font: PDFFont=sans,tint=ink,center=false) => {
    const clean = text.replace(/[\r\n\t]/g,' '); let size=maxSize, lines: string[]=[];
    do {
      lines=[]; let current='';
      for(const word of clean.split(' ')){
        if(current && font.widthOfTextAtSize(`${current} ${word}`,size)>width){lines.push(current);current='';}
        if(font.widthOfTextAtSize(word,size)>width){
          for(const char of word){if(font.widthOfTextAtSize(current+char,size)>width){lines.push(current);current='';}current+=char;}
        }else current+=(current?' ':'')+word;
      }
      if(current)lines.push(current);
      if(lines.length<=maxLines)break;
      size-=.5;
    }while(size>1);
    lines.forEach((line,i)=>draw(line,center?x+(width-font.widthOfTextAtSize(line,size))/2:x,y-i*(size+4),size,font,tint));
  };
  const center = (value:string,y:number,size:number,font:PDFFont=sans,tint=ink,lines=1) => fit(value,65,y,712,size,lines,font,tint,true);
  const line = (x1:number,y:number,x2:number) => {
    page.drawLine({start:{x:x1,y},end:{x:x2,y},color:accent,thickness:.7});
    elements.push(`<path d="M${x1} ${595-y}H${x2}" fill="none" stroke="${css(accent)}" stroke-width=".7"/>`);
  };
  const embed = async (data:string,x:number,y:number,width:number,height:number) => {
    try {
      const image = data.startsWith('data:image/png;') ? await pdf.embedPng(data) : await pdf.embedJpg(data);
      const dimensions=image.scaleToFit(width,height);
      page.drawImage(image,{x:x+(width-dimensions.width)/2,y:y+(height-dimensions.height)/2,width:dimensions.width,height:dimensions.height});
      elements.push(`<image href="${xml(data)}" x="${x+(width-dimensions.width)/2}" y="${595-y-(height+dimensions.height)/2}" width="${dimensions.width}" height="${dimensions.height}"/>`);
    }catch{throw new HttpError(400,'No se pudo leer el logo o la firma. Selecciona otra imagen.');}
  };
  rectangle({x:0,y:0,width:842,height:595,color:background});
  if(config.backgroundImage)await embed(config.backgroundImage,0,0,842,595);
  else if(config.layout==='classic'){
    rectangle({x:0,y:0,width:18,height:595,color:ink});
    rectangle({x:18,y:0,width:5,height:595,color:accent});
    rectangle({x:37,y:25,width:780,height:545,borderColor:accent,borderWidth:.8});
    rectangle({x:44,y:32,width:766,height:531,borderColor:accent,borderWidth:.25});
  }else{
    rectangle({x:0,y:575,width:842,height:20,color:ink});
    rectangle({x:0,y:0,width:842,height:14,color:accent});
  }
  if(showText){
  if(config.logo)await embed(config.logo,65,495,85,45);
  else draw('EVA',65,510,30,bold);
  fit(config.institution,165,526,420,13,1,bold);fit(config.department,165,507,420,10);
  }
  draw(`N.º ${certificate.code}`,635,517,11,bold,accent);
  if(demo)center('EJEMPLO · SIN VALIDEZ ACADÉMICA',548,8,bold,accent);
  if(showText){
  line(65,485,777);
  center(config.title,432,42,heading);
  center(certificate.type==='aprobacion'?'DE APROBACIÓN':'DE PARTICIPACIÓN',405,12,bold,accent);
  center(config.intro,373,11,sans,ink,2);
  }
  center(certificate.participantName,334,28,heading,ink,2);
  if(showText)center(config.reason,279,11,sans,ink,2);
  center(certificate.courseName,246,19,bold,ink,2);
  center(`${certificate.durationHours} HORAS ACADÉMICAS`,192,10,bold,accent);
  if(showText)line(65,176,777);
  const date=new Intl.DateTimeFormat('es-BO',{dateStyle:'long',timeZone:'America/La_Paz'}).format(new Date(certificate.issuedAt));
  draw('FECHA DE EMISIÓN',66,150,8,sans,accent);fit(date,66,132,230,11);
  draw('CÓDIGO DE VERIFICACIÓN',66,106,8,sans,accent);draw(certificate.code,66,87,15,bold);
  if(showText){
  if(config.signature)await embed(config.signature,350,120,230,48);
  line(340,116,590);
  fit(config.signatoryName,325,99,280,11,1,bold,ink,true);fit(config.signatoryRole,325,82,280,9,1,sans,ink,true);
  }
  if(signature)fit('Firmado digitalmente',325,66,280,8,1,sans,accent,true);
  const qrBytes=await QRCode.toBuffer(certificate.publicUrl,{type:'png',errorCorrectionLevel:'M',margin:4,width:400,color:{dark:config.primaryColor,light:'#ffffff'}});
  const qr=await pdf.embedPng(qrBytes);
  page.drawImage(qr,{x:666,y:65,width:104,height:104});draw('ESCANEA PARA VERIFICAR',654,52,8);
  elements.push(`<image href="data:image/png;base64,${qrBytes.toString('base64')}" x="666" y="426" width="104" height="104"/>`);
  if(showText)fit(config.footer,66,52,550,8);
  if(demo)fit('Documento de demostración. No acredita formación real.',66,40,550,7);
  return {pdf:signature?await signature.sign(pdf):Buffer.from(await pdf.save()),svg:`<svg xmlns="http://www.w3.org/2000/svg" width="842" height="595" viewBox="0 0 842 595" role="img" aria-label="Vista previa del certificado">${elements.join('')}</svg>`};
}
export async function generateTemplateCertificate(certificate:Certificate):Promise<Buffer>{return (await renderTemplate(certificate)).pdf;}
export async function generateTemplatePreview(certificate:Certificate):Promise<string>{return (await renderTemplate(certificate)).svg;}
