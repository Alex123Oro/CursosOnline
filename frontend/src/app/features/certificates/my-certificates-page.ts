import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Certificate, CertificateService } from '../../core/certificate.service';
import { SessionService } from '../../core/session.service';
import { CertificateActions } from './certificate-actions';
import { certificateDate } from './certificate-presentation';

@Component({ selector: 'app-my-certificates-page', imports: [RouterLink, CertificateActions], templateUrl: './my-certificates-page.html', styleUrl: './my-certificates-page.scss' })
export class MyCertificatesPage {
  private readonly api = inject(CertificateService);
  private readonly session = inject(SessionService);
  private readonly retryCount = signal(0);
  readonly items = signal<Certificate[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly date = certificateDate;
  constructor() {
    effect(onCleanup => {
      const user = this.session.currentUser(); this.retryCount();
      untracked(() => {
        this.items.set([]); this.error.set(''); this.loading.set(false);
        if (user?.role !== 'PARTICIPANT') return;
        this.loading.set(true);
        const sub = this.api.mine().subscribe({
          next: items => { this.items.set(items); this.loading.set(false); },
          error: error => { this.error.set(error.error?.message ?? 'No se pudieron cargar tus certificados.'); this.loading.set(false); }
        });
        onCleanup(() => sub.unsubscribe());
      });
    });
  }
  retry() { this.retryCount.update(value => value + 1); }
}
