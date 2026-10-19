import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
export type CertificateTemplateType = 'aprobacion'|'participacion';
export interface CertificateTemplateConfig {
  institution:string; department:string; title:string; intro:string; reason:string;
  signatoryName:string; signatoryRole:string; footer:string;
  primaryColor:string; accentColor:string; backgroundColor:string; font:'serif'|'sans'; layout:'classic'|'modern'; logo:string; signature:string;
  backgroundImage:string; backgroundName:string; showTemplateText:boolean;
}
export interface CertificateTemplateInput { name:string; type:CertificateTemplateType; config:CertificateTemplateConfig; }
export interface CertificateTemplate extends CertificateTemplateInput { id:string; version:number; updatedAt:string; }
export const templateDefaults = (type:CertificateTemplateType):CertificateTemplateConfig => ({
  institution:'EVA · Formación continua',department:'Laboratorio de Informática',title:'CERTIFICADO',intro:'Se otorga el presente certificado a',
  reason:type==='aprobacion'?'por haber aprobado satisfactoriamente el curso':'por su participación en el curso',
  signatoryName:'Autoridad institucional',signatoryRole:'Formación continua',footer:'Documento electrónico de formación continua.',
  primaryColor:'#064542',accentColor:'#A8854D',backgroundColor:'#FCF9F3',font:'serif',layout:'classic',logo:'',signature:'',backgroundImage:'',backgroundName:'',showTemplateText:true
});
@Injectable({providedIn:'root'})
export class CertificateTemplateService {
  private readonly http=inject(HttpClient);
  private readonly base=`${environment.apiBaseUrl}/certificate-templates`;
  list(){return this.http.get<CertificateTemplate[]>(this.base);}
  create(input:CertificateTemplateInput){return this.http.post<CertificateTemplate>(this.base,input);}
  update(id:string,input:CertificateTemplateInput,version:number){return this.http.put<CertificateTemplate>(`${this.base}/${id}`,{...input,version});}
  preview(input:CertificateTemplateInput){return this.http.post(`${this.base}/preview-image`,input,{responseType:'blob'});}
  previewPdf(input:CertificateTemplateInput){return this.http.post(`${this.base}/preview`,input,{responseType:'blob'});}
}
