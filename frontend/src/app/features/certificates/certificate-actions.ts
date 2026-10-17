import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { Certificate, CertificateService } from '../../core/certificate.service';

@Component({
  selector: 'app-certificate-actions',
  templateUrl: './certificate-actions.html',
  styleUrl: './certificate-actions.scss'
})
export class CertificateActions {
  readonly certificate = input.required<Certificate>();
  private readonly api = inject(CertificateService);
  private readonly destroy = inject(DestroyRef);
  private alive = true;
  readonly downloading = signal(false);
  readonly copying = signal(false);
  readonly sharing = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  constructor() { this.destroy.onDestroy(() => { this.alive = false; }); }

  download() {
    const certificate = this.certificate();
    if (certificate.status !== 'VALID' || this.downloading()) return;
    this.downloading.set(true); this.error.set(''); this.message.set('');
    this.api.download(certificate.id).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.downloading.set(false))).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const course = certificate.courseName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60);
        anchor.href = url; anchor.download = `certificado-${course}-${certificate.code}.pdf`;
        document.body.append(anchor); anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.message.set('Descarga iniciada.');
      },
      error: async error => {
        let message = 'No se pudo descargar el certificado. Inténtalo nuevamente.';
        if (error.error instanceof Blob) {
          try { message = JSON.parse(await error.error.text()).message || message; } catch { /* Non-JSON gateway error. */ }
        } else message = error.error?.message ?? message;
        if (this.alive) this.error.set(message);
      }
    });
  }
  share() { this.sharing.update(value => !value); this.message.set(''); this.error.set(''); }
  async copy() {
    if (this.copying()) return;
    this.copying.set(true); this.error.set(''); this.message.set('');
    try {
      await navigator.clipboard.writeText(this.certificate().publicUrl);
      if (this.alive) this.message.set('Enlace copiado');
    } catch {
      if (this.alive) this.error.set('No se pudo copiar. Selecciona el enlace y cópialo manualmente.');
    } finally { if (this.alive) this.copying.set(false); }
  }
}
