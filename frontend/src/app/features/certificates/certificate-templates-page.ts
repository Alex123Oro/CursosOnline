import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, CanDeactivateFn } from '@angular/router';
import { Subscription } from 'rxjs';
import { CertificateTemplateService, CertificateTemplate, CertificateTemplateConfig, CertificateTemplateInput, CertificateTemplateType, templateDefaults } from '../../core/certificate-template.service';

@Component({selector:'app-certificate-templates-page',imports:[ReactiveFormsModule,RouterLink],templateUrl:'./certificate-templates-page.html',styleUrl:'./certificate-templates-page.scss'})
export class CertificateTemplatesPage {
  private readonly api=inject(CertificateTemplateService);
  private readonly fb=inject(FormBuilder);
  readonly templates=signal<CertificateTemplate[]>([]);
  readonly selected=signal<CertificateTemplate|null>(null);
  readonly loading=signal(true);readonly saving=signal(false);readonly dirty=signal(false);
  readonly error=signal('');readonly feedback=signal('');readonly previewError=signal('');readonly previewLoading=signal(false);
  readonly previewUrl=signal<string|null>(null);readonly imageLoading=signal(false);
  readonly downloadingPreview=signal(false);
  private objectUrl='';private timer?:ReturnType<typeof setTimeout>;private previewRequest?:Subscription;
  readonly form=this.fb.nonNullable.group({
    name:['Nueva plantilla de aprobación',[Validators.required,Validators.minLength(3),Validators.maxLength(100)]],
    type:['aprobacion' as CertificateTemplateType,Validators.required],
    institution:['EVA · Formación continua',[Validators.required,Validators.maxLength(85)]],department:['Laboratorio de Informática',Validators.maxLength(85)],
    title:['CERTIFICADO',[Validators.required,Validators.maxLength(50)]],intro:['Se otorga el presente certificado a',[Validators.required,Validators.maxLength(180)]],
    reason:[templateDefaults('aprobacion').reason,[Validators.required,Validators.maxLength(180)]],
    signatoryName:['Autoridad institucional',Validators.maxLength(80)],signatoryRole:['Formación continua',Validators.maxLength(80)],footer:['Documento electrónico de formación continua.',Validators.maxLength(140)],
    primaryColor:['#064542',Validators.pattern(/^#[0-9a-fA-F]{6}$/)],accentColor:['#A8854D',Validators.pattern(/^#[0-9a-fA-F]{6}$/)],backgroundColor:['#FCF9F3',Validators.pattern(/^#[0-9a-fA-F]{6}$/)],
    font:['serif' as CertificateTemplateConfig['font']],layout:['classic' as CertificateTemplateConfig['layout']],logo:[''],signature:[''],
    backgroundImage:[''],backgroundName:[''],showTemplateText:[true]
  });
  constructor(){
    const changes=this.form.valueChanges.subscribe(()=>{this.dirty.set(true);this.feedback.set('');this.queuePreview();});
    inject(DestroyRef).onDestroy(()=>{changes.unsubscribe();this.previewRequest?.unsubscribe();clearTimeout(this.timer);if(this.objectUrl)URL.revokeObjectURL(this.objectUrl);});
    this.load();
  }
  load(){
    this.loading.set(true);this.error.set('');
    this.api.list().subscribe({next:items=>{this.templates.set(items);this.loading.set(false);if(!this.selected())this.apply(items[0]??null);},error:()=>{this.loading.set(false);this.error.set('No se pudieron cargar las plantillas.');}});
  }
  private apply(template:CertificateTemplate|null){
    this.selected.set(template);this.form.reset(template?{name:template.name,type:template.type,...template.config}:{name:'Nueva plantilla de aprobación',type:'aprobacion',...templateDefaults('aprobacion')});
    this.dirty.set(false);this.error.set('');this.feedback.set('');this.queuePreview();
  }
  canLeave(){return !this.dirty()||window.confirm('Hay cambios sin guardar en la plantilla. ¿Quieres descartarlos?');}
  select(template:CertificateTemplate){if(!this.saving()&&this.canLeave())this.apply(template);}
  newTemplate(){if(!this.saving()&&this.canLeave())this.apply(null);}
  changeType(){
    const type=this.form.controls.type.value;
    const reason=this.form.controls.reason.value;
    if([templateDefaults('aprobacion').reason,templateDefaults('participacion').reason].includes(reason))this.form.controls.reason.setValue(templateDefaults(type).reason);
  }
  payload():CertificateTemplateInput{const {name,type,...config}=this.form.getRawValue();return {name:name.trim(),type,config};}
  save(){
    this.form.markAllAsTouched();if(this.form.invalid||this.saving()||this.imageLoading())return;
    this.saving.set(true);this.error.set('');
    const selected=this.selected();const request=selected?this.api.update(selected.id,this.payload(),selected.version):this.api.create(this.payload());
    request.subscribe({next:saved=>{this.templates.update(items=>[saved,...items.filter(item=>item.id!==saved.id)]);this.apply(saved);this.saving.set(false);this.feedback.set('Plantilla guardada. Ya puedes seleccionarla al emitir certificados.');},error:error=>{this.saving.set(false);this.error.set(error.error?.fields?.[0]?.message??error.error?.message??'No se pudo guardar la plantilla.');}});
  }
  queuePreview(){clearTimeout(this.timer);this.previewRequest?.unsubscribe();this.timer=setTimeout(()=>this.preview(),600);}
  preview(){
    clearTimeout(this.timer);this.previewRequest?.unsubscribe();
    if(this.form.invalid){this.previewLoading.set(false);this.previewError.set('Completa los campos obligatorios para actualizar la vista previa.');return;}
    this.previewLoading.set(true);this.previewError.set('');
    this.previewRequest=this.api.preview(this.payload()).subscribe({next:blob=>{
      if(!blob.type.startsWith('image/')){this.previewFailed();return;}
      if(this.objectUrl)URL.revokeObjectURL(this.objectUrl);this.objectUrl=URL.createObjectURL(blob);
      this.previewUrl.set(this.objectUrl);this.previewLoading.set(false);
    },error:async error=>{this.previewLoading.set(false);let message='No se pudo generar la vista previa.';try{const body=error.error instanceof Blob?JSON.parse(await error.error.text()):error.error;message=body?.fields?.[0]?.message??body?.message??message;}catch{}this.previewError.set(message);}});
  }
  previewFailed(){
    this.previewLoading.set(false);this.previewUrl.set(null);
    this.previewError.set('El navegador no pudo mostrar la imagen. Pulsa Actualizar o descarga la vista previa en PDF.');
  }
  downloadPreview(){
    if(this.form.invalid){this.form.markAllAsTouched();this.previewError.set('Completa los campos obligatorios antes de descargar la vista previa.');return;}
    if(this.downloadingPreview())return;
    this.downloadingPreview.set(true);
    this.api.previewPdf(this.payload()).subscribe({next:blob=>{
      this.downloadingPreview.set(false);
      if(blob.type!=='application/pdf'){this.previewError.set('El servidor no devolvió un PDF válido. Vuelve a intentarlo.');return;}
      const url=URL.createObjectURL(blob);const link=document.createElement('a');
      link.href=url;link.download='vista-previa-certificado.pdf';document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    },error:()=>{this.downloadingPreview.set(false);this.previewError.set('No se pudo descargar el PDF. Pulsa Actualizar y vuelve a intentarlo.');}});
  }
  async uploadPdf(input:HTMLInputElement){
    const file=input.files?.[0];input.value='';if(!file||this.imageLoading())return;
    if(file.size>10*1024*1024||!file.name.toLowerCase().endsWith('.pdf')){this.error.set('Selecciona un PDF de hasta 10 MB.');return;}
    this.imageLoading.set(true);this.error.set('');this.previewRequest?.unsubscribe();clearTimeout(this.timer);
    let task:import('pdfjs-dist').PDFDocumentLoadingTask|undefined;
    try{
      const bytes=new Uint8Array(await file.arrayBuffer());
      if(!new TextDecoder().decode(bytes.subarray(0,5)).startsWith('%PDF-'))throw new Error();
      const pdfjs=await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.min.mjs';
      task=pdfjs.getDocument({data:bytes,useSystemFonts:true});
      const pdf=await task.promise;const page=await pdf.getPage(1);const original=page.getViewport({scale:1});
      if(original.width<original.height)throw new Error('portrait');
      const viewport=page.getViewport({scale:Math.min(2400/original.width,1700/original.height)});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const context=canvas.getContext('2d');if(!context)throw new Error();
      await page.render({canvas,canvasContext:context,viewport,background:'#ffffff'}).promise;
      let image='';for(const quality of [.94,.85,.7,.55]){image=canvas.toDataURL('image/jpeg',quality);if(image.length<=1500000)break;}
      if(image.length>1500000)throw new Error('size');
      this.form.patchValue({backgroundImage:image,backgroundName:file.name.slice(0,150),showTemplateText:false});
      this.feedback.set(`PDF importado${pdf.numPages>1?' (solo la primera página)':''}. Revisa los datos superpuestos y guarda la plantilla.`);
    }catch(error){
      const message=error instanceof Error?error.message:'';
      this.error.set(message==='portrait'?'Usa un PDF horizontal para que coincida con el formato del certificado.':message==='size'?'El diseño es demasiado pesado. Simplifica las imágenes del PDF y vuelve a subirlo.':'No se pudo importar el PDF. Comprueba que sea válido y no esté protegido con contraseña.');
    }finally{await task?.destroy();this.imageLoading.set(false);this.queuePreview();}
  }
  removeBackground(){this.form.patchValue({backgroundImage:'',backgroundName:'',showTemplateText:true});}
  async image(input:HTMLInputElement,field:'logo'|'signature'){
    const file=input.files?.[0];if(!file||this.imageLoading())return;input.value='';
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){this.error.set('Selecciona una imagen PNG, JPEG o WebP de hasta 5 MB.');return;}
    this.imageLoading.set(true);this.error.set('');
    try{
      const bitmap=await createImageBitmap(file);let data='';
      for(const max of [400,320,240,160,96]){
        const scale=Math.min(1,max/bitmap.width,max/bitmap.height);const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        const context=canvas.getContext('2d');if(!context)throw new Error();context.drawImage(bitmap,0,0,canvas.width,canvas.height);data=canvas.toDataURL('image/png');if(data.length<=60000)break;
      }
      bitmap.close();if(data.length>60000)throw new Error();this.form.controls[field].setValue(data);
    }catch{this.error.set('No se pudo preparar la imagen. Prueba con otra imagen más sencilla.');}
    finally{this.imageLoading.set(false);}
  }
}
export const templateDraftGuard:CanDeactivateFn<CertificateTemplatesPage>=page=>page.canLeave();
