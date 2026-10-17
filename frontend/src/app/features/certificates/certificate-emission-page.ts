import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { Certificate, CertificateCandidate, CertificateCourse, CertificateService } from '../../core/certificate.service';
import { SessionService } from '../../core/session.service';
import { RouterLink } from '@angular/router';
import { CertificateTemplateService, CertificateTemplate } from '../../core/certificate-template.service';

@Component({ selector: 'app-certificate-emission-page', imports: [RouterLink], templateUrl: './certificate-emission-page.html', styleUrl: './certificate-emission-page.scss' })
export class CertificateEmissionPage {
  private readonly api = inject(CertificateService);
  private readonly session = inject(SessionService);
  private readonly templateApi = inject(CertificateTemplateService);
  readonly templates = signal<CertificateTemplate[]>([]);
  readonly templateId = signal('');
  readonly templateError = signal('');
  readonly availableTemplates = computed(() => this.templates().filter(template => template.type === this.type()));
  readonly selectedTemplate = computed(() => this.availableTemplates().find(template => template.id === this.templateId()));
  private readonly courseRetry = signal(0);
  private readonly listRetry = signal(0);
  private mutation?: Subscription;
  readonly courses = signal<CertificateCourse[]>([]);
  readonly courseId = signal('');
  readonly type = signal<Certificate['type']>('aprobacion');
  readonly typeLabel = computed(() => this.type() === 'aprobacion' ? 'aprobación' : 'participación');
  readonly coursesLoading = signal(false);
  readonly coursesError = signal('');
  readonly students = signal<CertificateCandidate[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly feedback = signal('');
  readonly failures = signal<string[]>([]);
  readonly confirmation = signal<CertificateCandidate | 'bulk' | null>(null);
  readonly search = signal('');
  readonly page = signal(0);
  readonly eligible = computed(() => this.students().filter(row => this.canIssue(row)).slice(0,100));
  readonly filtered = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('es');
    return this.students().filter(row => row.name.toLocaleLowerCase('es').includes(query));
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 8)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1));
  readonly visible = computed(() => this.filtered().slice(this.currentPage() * 8, (this.currentPage() + 1) * 8));
  readonly confirmationText = computed(() => {
    const target = this.confirmation();
    return target === 'bulk' ? `Se emitirán ${this.eligible().length} certificados de ${this.typeLabel()} de este curso, incluyendo otras páginas.`
      : target ? `Se emitirá el certificado de ${this.typeLabel()} de ${target.name}.` : '';
  });

  constructor() {
    effect(onCleanup => {
      const user = this.session.currentUser(); this.courseRetry();
      untracked(() => {
        this.courses.set([]); this.coursesError.set(''); this.coursesLoading.set(false);
        this.templates.set([]); this.templateId.set(''); this.templateError.set('');
        if (user?.role !== 'ADMIN') return;
        const templateSub = this.templateApi.list().subscribe({
          next: templates => { this.templates.set(templates); this.templateId.set(templates.find(template => template.type === this.type())?.id ?? ''); this.templateError.set(''); },
          error: () => { this.templates.set([]); this.templateId.set(''); this.templateError.set('No se pudieron cargar las plantillas. Pulsa Reintentar para volver a cargarlas.'); }
        });
        onCleanup(() => templateSub.unsubscribe());
        this.coursesLoading.set(true);
        const sub = this.api.courses().subscribe({
          next: courses => { this.courses.set(courses); this.coursesLoading.set(false); },
          error: error => { this.coursesError.set(error.error?.message ?? 'No se pudieron cargar los cursos.'); this.coursesLoading.set(false); }
        });
        onCleanup(() => sub.unsubscribe());
      });
    });
    effect(onCleanup => {
      const user = this.session.currentUser(); const id = this.courseId(); const type = this.type(); this.listRetry();
      onCleanup(() => { this.mutation?.unsubscribe(); });
      untracked(() => {
        this.students.set([]); this.error.set(''); this.loading.set(false); this.saving.set(false);
        this.confirmation.set(null); this.page.set(0);
        if (user?.role !== 'ADMIN' || !id) return;
        this.loading.set(true);
        const sub = this.api.roster(id, type).subscribe({
          next: roster => { this.students.set(roster.students); this.loading.set(false); },
          error: error => { this.error.set(error.error?.message ?? 'No se pudieron cargar los participantes.'); this.loading.set(false); }
        });
        onCleanup(() => sub.unsubscribe());
      });
    });
  }
  canIssue(row: CertificateCandidate) { return !!this.templateId() && row.approvalStatus === 'APROBADO' && !row.certificate && !row.blockedReason; }
  reason(row: CertificateCandidate) { return row.certificate ? 'El certificado ya fue emitido.' : row.blockedReason || (!this.templateId() ? 'Selecciona una plantilla de certificado.' : 'El participante aún no ha aprobado el curso.'); }
  selectType(value: string) {
    if (this.saving() || (value !== 'aprobacion' && value !== 'participacion')) return;
    this.feedback.set(''); this.failures.set([]); this.type.set(value);
    this.templateId.set(this.templates().find(template => template.type === value)?.id ?? '');
  }
  selectCourse(id: string) {
    if (this.saving()) return;
    this.feedback.set(''); this.failures.set([]); this.search.set(''); this.courseId.set(id);
  }
  requestIssue(row: CertificateCandidate) { if (!this.saving() && this.canIssue(row)) this.confirmation.set(row); }
  selectTemplate(id: string) { if (!this.saving()) { this.templateId.set(id); this.confirmation.set(null); } }
  requestBulk() { if (!this.saving() && this.eligible().length) this.confirmation.set('bulk'); }
  cancel() { if (!this.saving()) this.confirmation.set(null); }
  confirm() {
    const target = this.confirmation();
    if (!target || this.saving()) return;
    this.saving.set(true); this.error.set(''); this.feedback.set(''); this.failures.set([]);
    const complete = () => { this.saving.set(false); this.confirmation.set(null); this.listRetry.update(value => value + 1); };
    const fail = (error: { error?: { message?: string } }) => {
      this.saving.set(false); this.confirmation.set(null);
      this.error.set(error.error?.message ?? 'No se pudo confirmar la emisión. Recarga la lista antes de reintentar.');
    };
    if (target === 'bulk') {
      this.mutation = this.api.bulk(this.courseId(), this.eligible().map(row => row.enrollmentId), this.type(), this.templateId()).subscribe({
        next: result => {
          this.feedback.set(`${result.issued.length} certificados emitidos; ${result.failed.length} no emitidos.`);
          this.failures.set(result.failed.map(row => `${this.students().find(student => student.enrollmentId === row.enrollmentId)?.name ?? row.enrollmentId}: ${row.message}`));
          complete();
        }, error: fail
      });
    } else {
      this.mutation = this.api.issue(target.enrollmentId, this.type(), this.templateId()).subscribe({
        next: result => { this.feedback.set(`Certificado emitido correctamente. Código: ${result.code}`); complete(); }, error: fail
      });
    }
  }
  changePage(delta: number) { this.page.set(Math.max(0, Math.min(this.currentPage() + delta, this.pageCount() - 1))); }
  retryCourses() { this.courseRetry.update(value => value + 1); }
  retryList() { this.listRetry.update(value => value + 1); }
}
