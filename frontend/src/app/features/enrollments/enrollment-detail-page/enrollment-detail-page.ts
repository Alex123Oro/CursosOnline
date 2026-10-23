import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { finalize, Observable, Subscription } from 'rxjs';
import { Enrollment, EnrollmentService } from '../../../core/enrollment.service';
import { SessionService } from '../../../core/session.service';
import { calculateEnrollmentAmount } from '../../../core/enrollment-amount';
import { enrollmentParams, readEnrollmentQuery } from '../enrollment-navigation';
type Action = 'scholarship' | 'payment' | 'confirm' | 'deactivate' | 'cancel-reservation' | 'reject' | null;
@Component({
  selector: 'app-enrollment-detail-page',
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './enrollment-detail-page.html',
  styleUrl: './enrollment-detail-page.scss',
})
export class EnrollmentDetailPage {
  private readonly api = inject(EnrollmentService);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly retryToken = signal(0);
  private mutation: Subscription | undefined;
  readonly enrollment = signal<Enrollment | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly isSaving = signal(false);
  readonly feedback = signal('');
  readonly error = signal('');
  readonly action = signal<Action>(null);
  readonly confirmed = signal(false);
  private paymentRequestId: string = crypto.randomUUID();
  readonly closureForm = this.fb.nonNullable.group({ reason: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]] });
  readonly backQuery = computed(() => {
    const state = readEnrollmentQuery(this.query());
    const row = this.enrollment();
    return enrollmentParams({
      ...state,
      courseId: state.courseId || row?.courseId || '',
      status: this.query().has('estado') ? state.status : (row?.status ?? state.status),
    });
  });
  readonly enrolledQuery = computed(() =>
    enrollmentParams({
      courseId: this.enrollment()?.courseId ?? '',
      status: 'INSCRITO',
      search: '',
      page: 1,
    })
  );
  readonly canConfirm = computed(() => {
    const row = this.enrollment();
    return (
      !!row &&
      row.status === 'PREINSCRITO' &&
      (row.finalAmount <= 0 || row.paymentStatus === 'PAGADO')
    );
  });
  readonly scholarshipForm = this.fb.nonNullable.group({
    scholarshipPercent: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    reason: ['', [Validators.required, Validators.minLength(3), Validators.pattern(/\S/)]],
  });
  readonly paymentForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(-99999999), Validators.max(99999999)]],
    kind: ['ABONO' as 'ABONO' | 'DEVOLUCION' | 'AJUSTE'],
    reason: ['Abono registrado por administración', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]],
    reference: ['', Validators.maxLength(100)]
  }, { validators: control => Number(control.value.amount) === 0 || (control.value.kind !== 'AJUSTE' && Number(control.value.amount) < 0) ? { amount: true } : null });
  private readonly scholarshipValues = toSignal(this.scholarshipForm.valueChanges, {
    initialValue: this.scholarshipForm.getRawValue(),
  });
  readonly preview = computed(() =>
    calculateEnrollmentAmount(
      this.enrollment()?.basePrice ?? 0,
      Number(this.scholarshipValues().scholarshipPercent ?? 0)
    )
  );
  private readonly actionPanel = viewChild<ElementRef<HTMLElement>>('actionPanel');
  constructor() {
    afterRenderEffect(() => {
      this.action();
      this.actionPanel()?.nativeElement.focus();
    });
    effect((onCleanup) => {
      const id = this.params().get('enrollmentId');
      const user = this.session.currentUser();
      this.retryToken();
      untracked(() => {
        this.mutation?.unsubscribe();
        this.mutation = undefined;
        this.enrollment.set(null);
        this.loadError.set('');
        this.loading.set(false);
        this.action.set(null);
        this.error.set('');
        this.feedback.set('');
        this.confirmed.set(false);
        if (user?.role !== 'ADMIN' || !id) return;
        this.loading.set(true);
        const sub = this.api.detail(id).subscribe({
          next: (row) => {
            this.enrollment.set(row);
            this.loading.set(false);
          },
          error: (error) => {
            this.loadError.set(error.error?.message ?? 'No se pudo cargar la inscripción.');
            this.loading.set(false);
          },
        });
        onCleanup(() => sub.unsubscribe());
      });
    });
  }
  retry() {
    this.retryToken.update((value) => value + 1);
  }
  paymentLabel(status: Enrollment['paymentStatus']) {
    return {
      PENDIENTE: 'Pendiente',
      PARCIAL: 'Parcial',
      PAGADO: 'Pagado',
      NO_REQUIERE: 'No requiere pago',
    }[status];
  }
  date(value: string) {
    return new Intl.DateTimeFormat('es-BO', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/La_Paz',
    }).format(new Date(value));
  }
  open(action: Action) {
    if (this.isSaving()) return;
    const row = this.enrollment();
    if (!row) return;
    this.error.set('');
    this.feedback.set('');
    this.scholarshipForm.reset({
      scholarshipPercent: row.scholarshipPercent,
      reason: row.scholarshipReason ?? '',
    });
    this.paymentRequestId = crypto.randomUUID();
    this.paymentForm.reset({ amount: Math.max(0, row.finalAmount - (row.paymentAmount ?? 0)), kind: 'ABONO', reason: 'Abono registrado por administración', reference: '' });
    this.closureForm.reset();
    this.action.set(action);
  }
  cancel() {
    if (!this.isSaving()) {
      this.action.set(null);
      this.error.set('');
    }
  }
  saveScholarship() {
    this.scholarshipForm.markAllAsTouched();
    const row = this.enrollment();
    if (!row || this.scholarshipForm.invalid || this.isSaving()) return;
    const value = this.scholarshipForm.getRawValue();
    this.update(
      this.api.assignScholarship(row.id, value.scholarshipPercent, value.reason.trim()),
      'Beca asignada correctamente.'
    );
  }
  savePayment() {
    this.paymentForm.markAllAsTouched();
    const row = this.enrollment();
    if (!row || this.paymentForm.invalid || this.isSaving()) return;
    const input = this.paymentForm.getRawValue();
    this.update(this.api.movement(row.id, { ...input, reason: input.reason.trim(), requestId: this.paymentRequestId }), 'Movimiento registrado. El historial anterior se conserva.');
  }
  closeReservation() {
    this.closureForm.markAllAsTouched();
    const row = this.enrollment();
    if (!row || this.closureForm.invalid || this.isSaving()) return;
    const reason = this.closureForm.getRawValue().reason.trim();
    this.update(this.action() === 'reject' ? this.api.reject(row.id, reason) : this.api.cancelReservation(row.id, reason), 'Preinscripción cerrada. El cupo quedó disponible.');
  }
  statusLabel(status: Enrollment['status']) { return ({ PREINSCRITO: 'Preinscrito', INSCRITO: 'Inscrito', CANCELADO: 'Cancelada', RECHAZADO: 'Rechazada', CADUCADO: 'Caducada' })[status]; }
  deactivate() {
    const row = this.enrollment();
    if (!row || this.isSaving()) return;
    this.update(
      this.api.deactivateScholarship(row.id),
      'Beca desactivada. El importe se recalculó sin el beneficio.'
    );
  }
  confirm() {
    const row = this.enrollment();
    if (!row || !this.canConfirm() || this.isSaving()) return;
    this.update(this.api.confirm(row.id), 'Inscripción confirmada correctamente.', true);
  }
  private update(request: Observable<Enrollment>, message: string, confirmed = false) {
    const id = this.enrollment()?.id;
    const userId = this.session.currentUser()?.id;
    this.isSaving.set(true);
    this.error.set('');
    this.feedback.set('');
    this.mutation = request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSaving.set(false))
      )
      .subscribe({
        next: (row) => {
          if (this.enrollment()?.id !== id || this.session.currentUser()?.id !== userId) return;
          this.enrollment.set(row);
          this.action.set(null);
          this.feedback.set(message);
          this.confirmed.set(confirmed);
        },
        error: (error) => {
          if (this.enrollment()?.id !== id || this.session.currentUser()?.id !== userId) return;
          this.error.set(
            error.error?.fields?.map((field: { message: string }) => field.message).join(' ') ||
              error.error?.message ||
              'No se pudo completar la operación. Inténtalo de nuevo.'
          );
        },
      });
  }
}
