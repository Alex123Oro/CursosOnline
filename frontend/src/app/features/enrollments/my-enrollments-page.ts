import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Enrollment, EnrollmentService } from '../../core/enrollment.service';

@Component({
  selector: 'app-my-enrollments', imports: [RouterLink, FormsModule],
  template: `<section class="eva-page eva-workspace">
    <header><p class="eyebrow">MI FORMACIÓN</p><h1>Mis inscripciones</h1><p>Consulta tus solicitudes, pagos y confirmaciones.</p></header>
    @if (loading()) { <p role="status">Cargando inscripciones…</p> }
    @if (error()) { <p role="alert">{{ error() }} <button (click)="load()" [disabled]="saving()">Reintentar</button></p> }
    @if (message()) { <p role="status">{{ message() }}</p> }
    @for (row of rows(); track row.id) {
      <article class="reservation"><div><h2>{{ row.courseName }}</h2><p>{{ labels[row.status] }} · {{ row.participantTypeName }}</p></div>
        <p>Total: <strong>{{ row.finalAmount }} Bs</strong> · Registrado: {{ row.paymentAmount ?? 0 }} Bs</p>
        @if (row.closureReason) { <p>{{ row.closureReason }}</p> }
        @if (row.status === 'PREINSCRITO') {
          @if ((row.paymentAmount ?? 0) > 0) { <p>Esta reserva tiene pagos. Contacta a administración para gestionar una devolución o cancelación.</p> }
          @else { <button type="button" (click)="open(row)" [disabled]="saving()">Cancelar reserva</button> }
        }
        <a [routerLink]="['/catalogo', row.courseId]">Ver curso</a>
        @if (row.history?.length) { <details><summary>Historial de la inscripción</summary>@for (event of row.history; track event.id) { <p>{{ labels[event.status] }} · {{ event.reason }}</p> }</details> }
      </article>
    } @empty { @if (!loading() && !error()) { <p>Aún no tienes inscripciones. <a routerLink="/catalogo">Explorar cursos</a></p> } }
    @if (target(); as row) {
      <section class="reservation" role="dialog" aria-labelledby="cancel-title"><h2 id="cancel-title">Cancelar reserva de {{ row.courseName }}</h2><p>Se liberará tu cupo y se conservará el historial de la solicitud.</p>
        <label>Motivo<textarea rows="3" maxlength="500" [(ngModel)]="reason" [disabled]="saving()"></textarea></label>
        <button type="button" (click)="cancelReservation()" [disabled]="saving() || reason.trim().length < 5">Confirmar cancelación</button>
        <button type="button" (click)="target.set(null)" [disabled]="saving()">Volver</button>
      </section>
    }
  </section>`,
  styles: [`.reservation{background:var(--surface,#fff);border:1px solid #c7dcd5;border-radius:16px;padding:24px;margin:20px 0}.reservation h2{margin:0 0 8px}button,a{margin-right:16px}button{padding:10px 16px;border:1px solid #15746a;border-radius:8px;cursor:pointer}label,textarea{display:block}textarea{width:100%;max-width:600px;margin:8px 0 16px;font:inherit}details{margin-top:16px}`]
})
export class MyEnrollmentsPage {
  private readonly api = inject(EnrollmentService);
  private readonly destroy = inject(DestroyRef);
  readonly rows = signal<Enrollment[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly target = signal<Enrollment | null>(null);
  reason = '';
  readonly labels = { PREINSCRITO: 'Preinscrito', INSCRITO: 'Inscrito', CANCELADO: 'Cancelado', RECHAZADO: 'Rechazado', CADUCADO: 'Caducado' };
  constructor() { this.load(); }
  load() {
    this.loading.set(true); this.error.set('');
    this.api.mine().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: rows => { this.rows.set(rows); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set('No se pudieron cargar tus inscripciones.'); }
    });
  }
  open(row: Enrollment) { this.reason = ''; this.target.set(row); this.error.set(''); }
  cancelReservation() {
    const row = this.target(); if (!row || this.saving() || this.reason.trim().length < 5) return;
    this.saving.set(true); this.error.set('');
    this.api.cancelReservation(row.id, this.reason.trim()).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: updated => { this.rows.update(rows => rows.map(item => item.id === updated.id ? updated : item)); this.target.set(null); this.saving.set(false); this.message.set('Reserva cancelada. Se liberó el cupo.'); },
      error: err => { this.saving.set(false); this.error.set(err.error?.message ?? 'No se pudo cancelar la reserva.'); }
    });
  }
}
