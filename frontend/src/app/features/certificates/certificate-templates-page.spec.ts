import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CertificateTemplatesPage } from './certificate-templates-page';
import { templateDefaults } from '../../core/certificate-template.service';
import { environment } from '../../../environments/environment';
const base=`${environment.apiBaseUrl}/certificate-templates`;
const saved={id:'1',name:'Institucional',type:'aprobacion' as const,config:templateDefaults('aprobacion'),version:1,updatedAt:'2026-10-16T00:00:00Z'};
describe('CertificateTemplatesPage',()=>{
  let fixture:ComponentFixture<CertificateTemplatesPage>, page:CertificateTemplatesPage, http:HttpTestingController;
  beforeEach(async()=>{
    await TestBed.configureTestingModule({imports:[CertificateTemplatesPage],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting()]}).compileComponents();
    fixture=TestBed.createComponent(CertificateTemplatesPage);page=fixture.componentInstance;http=TestBed.inject(HttpTestingController);
    http.expectOne(base).flush([saved]);fixture.detectChanges();
  });
  afterEach(()=>{fixture.destroy();http.verify();vi.restoreAllMocks();});
  it('loads a real saved version and previews the same configuration through the PDF endpoint',()=>{
    expect(page.selected()?.id).toBe('1');expect(page.dirty()).toBe(false);
    page.preview();const request=http.expectOne(`${base}/preview-image`);
    expect(request.request.body.config).toEqual(saved.config);expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(),{status:400,statusText:'Bad Request'});
  });
  it('saves edits with the original version for concurrency protection',()=>{
    page.form.controls.institution.setValue('Institución renovada');page.save();
    const request=http.expectOne(`${base}/1`);expect(request.request.method).toBe('PUT');
    expect(request.request.body).toMatchObject({version:1,config:{institution:'Institución renovada'}});
    request.flush({...saved,version:2,config:request.request.body.config});
    expect(page.selected()?.version).toBe(2);expect(page.dirty()).toBe(false);
  });
  it('creates a participation template and updates its standard wording',()=>{
    page.newTemplate();page.form.controls.name.setValue('Participación moderna');page.form.controls.type.setValue('participacion');page.changeType();page.save();
    const request=http.expectOne(base);expect(request.request.body.type).toBe('participacion');
    expect(request.request.body.config.reason).toBe(templateDefaults('participacion').reason);
    expect(request.request.body.version).toBeUndefined();request.flush({...saved,...request.request.body,id:'2'});
    expect(page.templates()).toHaveLength(2);
  });
  it('preserves unsaved edits after a version conflict and prevents accidental discard',()=>{
    page.form.controls.title.setValue('CONSTANCIA');page.save();
    http.expectOne(`${base}/1`).flush({message:'La plantilla cambió.'},{status:409,statusText:'Conflict'});
    expect(page.form.controls.title.value).toBe('CONSTANCIA');expect(page.dirty()).toBe(true);
    vi.spyOn(window,'confirm').mockReturnValue(false);page.newTemplate();expect(page.selected()?.id).toBe('1');
  });
  it('reports a failed image instead of leaving an empty preview',()=>{
    page.previewUrl.set('blob:unavailable');page.previewFailed();
    expect(page.previewUrl()).toBeNull();expect(page.previewError()).toContain('descarga');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pdf-stage img')).toBeNull();
  });
  it('saves the imported PDF background in the version and can restore the built-in design',()=>{
    page.form.patchValue({backgroundImage:'data:image/jpeg;base64,background',backgroundName:'institucional.pdf',showTemplateText:false});
    page.save();const request=http.expectOne(`${base}/1`);
    expect(request.request.body.config).toMatchObject({backgroundName:'institucional.pdf',showTemplateText:false,backgroundImage:'data:image/jpeg;base64,background'});
    request.flush({...saved,version:2,config:request.request.body.config});
    page.removeBackground();expect(page.form.controls.backgroundImage.value).toBe('');expect(page.form.controls.showTemplateText.value).toBe(true);
  });
  it('rejects an unexpected response format instead of showing a broken image',()=>{
    page.preview();http.expectOne(`${base}/preview-image`).flush(new Blob(['%PDF'],{type:'application/pdf'}));
    expect(page.previewUrl()).toBeNull();expect(page.previewError()).toContain('navegador');
  });
  it('downloads a real PDF from the current unsaved configuration',()=>{
    vi.stubGlobal('URL', {createObjectURL:vi.fn(()=> 'blob:preview-pdf'),revokeObjectURL:vi.fn()});
    const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
    page.form.controls.title.setValue('CONSTANCIA');page.downloadPreview();
    const request=http.expectOne(`${base}/preview`);expect(request.request.body.config.title).toBe('CONSTANCIA');
    request.flush(new Blob(['%PDF-1.7'],{type:'application/pdf'}));
    expect(click).toHaveBeenCalled();expect(page.downloadingPreview()).toBe(false);
    vi.unstubAllGlobals();
  });
});
