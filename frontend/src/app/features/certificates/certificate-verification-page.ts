import { Component, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CertificateService, PublicCertificate } from '../../core/certificate.service';
import { certificateDate, certificateType } from './certificate-presentation';

@Component({ selector: 'app-certificate-verification-page', imports: [RouterLink], templateUrl: './certificate-verification-page.html', styleUrl: './certificate-verification-page.scss' })
export class CertificateVerificationPage {
  private readonly api = inject(CertificateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly retryCount = signal(0);
  readonly code = signal('');
  readonly item = signal<PublicCertificate | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly date = certificateDate;
  readonly type = certificateType;
  constructor() {
    effect(onCleanup => {
      const raw = this.params().get('codigo'); this.retryCount();
      untracked(() => {
        this.item.set(null); this.error.set(''); this.loading.set(false);
        if (!raw) return;
        const code = raw.trim().toUpperCase(); this.code.set(code);
        if (!/^[0-9A-F]{8}$/.test(code)) { this.error.set('El código debe contener ocho caracteres hexadecimales.'); return; }
        this.loading.set(true);
        const sub = this.api.verify(code).subscribe({
          next: item => { this.item.set(item); this.loading.set(false); },
          error: error => {
            this.error.set(error.status === 404 ? 'Certificado no válido o inexistente' : error.error?.message ?? 'No se pudo verificar el certificado. Inténtalo nuevamente.');
            this.loading.set(false);
          }
        });
        onCleanup(() => sub.unsubscribe());
      });
    });
  }
  submit() {
    const code = this.code().trim().toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(code)) { this.error.set('El código debe contener ocho caracteres hexadecimales.'); this.item.set(null); return; }
    if (this.params().get('codigo') === code) this.retryCount.update(value => value + 1);
    else void this.router.navigate(['/verificar', code]);
  }
}
