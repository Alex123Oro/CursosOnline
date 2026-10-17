import { Component, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Certificate, CertificateService } from '../../core/certificate.service';
import { SessionService } from '../../core/session.service';
import { CertificateActions } from './certificate-actions';
import { certificateDate, certificateType } from './certificate-presentation';

@Component({ selector: 'app-certificate-detail-page', imports: [RouterLink, CertificateActions], templateUrl: './certificate-detail-page.html', styleUrl: './certificate-detail-page.scss' })
export class CertificateDetailPage {
  private readonly api = inject(CertificateService);
  private readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly retryCount = signal(0);
  readonly item = signal<Certificate | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly date = certificateDate;
  readonly type = certificateType;
  constructor() {
    effect(onCleanup => {
      const user = this.session.currentUser(); const id = this.params().get('id'); this.retryCount();
      untracked(() => {
        this.item.set(null); this.error.set(''); this.loading.set(false);
        if (user?.role !== 'PARTICIPANT' || !id) return;
        if (!/^[1-9]\d*$/.test(id)) { this.error.set('Certificado no encontrado.'); return; }
        this.loading.set(true);
        const sub = this.api.detail(id).subscribe({
          next: item => { this.item.set(item); this.loading.set(false); },
          error: error => { this.error.set(error.error?.message ?? 'No se pudo cargar el certificado.'); this.loading.set(false); }
        });
        onCleanup(() => sub.unsubscribe());
      });
    });
  }
  retry() { this.retryCount.update(value => value + 1); }
}
