import { afterRenderEffect, Component, computed, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, Subscription } from 'rxjs';
import { CourseSessionService, CourseSession, SessionCourse } from '../../core/course-session.service';
import { SessionService } from '../../core/session.service';

const sameDay = (control: AbstractControl) => {
  const { startTime, durationMinutes } = control.value;
  if (!startTime || !durationMinutes) return null;
  const [hour, minute] = startTime.split(':').map(Number);
  return hour * 60 + minute + Number(durationMinutes) >= 1440 ? { sameDay: true } : null;
};
const validDate = (control: AbstractControl) => {
  const value = control.value;
  return value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) ? { date: true } : null;
};
const integer = (control: AbstractControl) => control.value !== null && !Number.isInteger(control.value) ? { integer: true } : null;
const calendarDates = (start: string, end: string, weekdays: number[]) => {
  const first = Date.parse(start), last = Date.parse(end);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first || last - first > 365 * 86400000) return [];
  const dates: string[] = [];
  for (let time = first; time <= last; time += 86400000) {
    const date = new Date(time);
    if (weekdays.includes(date.getUTCDay())) dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
};
const weeklyRange = (control: AbstractControl) => {
  const { startDate, endDate, weekdays } = control.value;
  if (!startDate || !endDate) return null;
  if (endDate < startDate || Date.parse(endDate) - Date.parse(startDate) > 365 * 86400000) return { range: true };
  return weekdays?.length && !calendarDates(startDate, endDate, weekdays).length ? { noDates: true } : null;
};

@Component({ selector: 'app-course-sessions-page', standalone: true, imports: [RouterLink, ReactiveFormsModule], templateUrl: './course-sessions-page.html', styleUrl: './course-sessions-page.scss' })
export class CourseSessionsPage {
  private readonly api = inject(CourseSessionService);
  readonly identity = inject(SessionService);
  readonly canManage = computed(() => this.identity.currentUser()?.role === 'ADMIN');
  private readonly route = inject(ActivatedRoute);
  private readonly id = toSignal(this.route.paramMap.pipe(map(params => params.get('courseId') ?? '')), { initialValue: '' });
  private active = new Subscription();
  readonly course = signal<SessionCourse | null>(null);
  readonly sessions = signal<CourseSession[]>([]);
  readonly pageSize = 6;
  private readonly page = signal(0);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.sessions().length / this.pageSize)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1));
  readonly visibleSessions = computed(() => this.sessions().slice(this.currentPage() * this.pageSize, (this.currentPage() + 1) * this.pageSize));
  readonly firstRow = computed(() => this.sessions().length ? this.currentPage() * this.pageSize + 1 : 0);
  readonly lastRow = computed(() => Math.min((this.currentPage() + 1) * this.pageSize, this.sessions().length));
  changePage(delta: number) { if (!this.saving()) this.page.set(Math.max(0, Math.min(this.currentPage() + delta, this.pageCount() - 1))); }
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly feedback = signal('');
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  private readonly planner = viewChild<ElementRef<HTMLElement>>('planner');
  readonly weekly = signal(false);
  readonly showAllPreview = signal(false);
  readonly weekdays = [{ value: 1, label: 'Lun', name: 'Lunes' }, { value: 2, label: 'Mar', name: 'Martes' }, { value: 3, label: 'Mié', name: 'Miércoles' }, { value: 4, label: 'Jue', name: 'Jueves' }, { value: 5, label: 'Vie', name: 'Viernes' }, { value: 6, label: 'Sáb', name: 'Sábado' }, { value: 0, label: 'Dom', name: 'Domingo' }];
  readonly scheduleForm = inject(FormBuilder).nonNullable.group({
    startDate: ['', [Validators.required, validDate]], endDate: ['', [Validators.required, validDate]],
    weekdays: [[] as number[], Validators.required],
    startTime: ['18:00', [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)]],
    durationMinutes: [60, [Validators.required, Validators.min(1), integer]]
  }, { validators: [sameDay, weeklyRange] });
  private readonly scheduleValue = toSignal(this.scheduleForm.valueChanges, { initialValue: this.scheduleForm.getRawValue() });
  readonly preview = computed(() => {
    const value = this.scheduleValue(); const course = this.course(); const rows = this.sessions();
    return calendarDates(value.startDate ?? '', value.endDate ?? '', value.weekdays ?? []).map(date => ({
      date, duplicate: rows.some(row => row.date === date && row.startTime === value.startTime),
      outside: !!course && !!((course.startDate && date < course.startDate) || (course.endDate && date > course.endDate))
    }));
  });
  readonly newCount = computed(() => this.preview().filter(row => !row.duplicate).length);
  readonly outsideCount = computed(() => this.preview().filter(row => row.outside && !row.duplicate).length);
  readonly groups = computed(() => {
    const grouped = new Map<string, CourseSession[]>();
    for (const session of this.sessions()) grouped.set(session.date, [...(grouped.get(session.date) ?? []), session]);
    return [...grouped].map(([date, sessions]) => ({ date, sessions }));
  });
  readonly totalHours = computed(() => new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 }).format(this.sessions().reduce((total, row) => total + row.durationMinutes, 0) / 60));
  formatDate(date: string, short = false) { return new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', ...(short ? { day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' }) }).format(new Date(`${date}T12:00:00Z`)); }
  agendaDate(date: string) { return new Intl.DateTimeFormat('es-BO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)); }
  readonly form = inject(FormBuilder).nonNullable.group({
    date: ['', [Validators.required, validDate]],
    startTime: ['', [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)]],
    durationMinutes: [60, [Validators.required, Validators.min(1), integer]]
  }, { validators: sameDay });
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly formWarning = computed(() => {
    const date = this.formValue().date;
    const course = this.course();
    return date && course && ((course.startDate && date < course.startDate) || (course.endDate && date > course.endDate))
      ? 'La fecha de la sesión está fuera del periodo del curso. Puedes guardarla igualmente.' : null;
  });

  constructor() {
    afterRenderEffect(() => {
      const panel = this.planner()?.nativeElement;
      this.editingId(); this.weekly();
      if (panel) { panel.focus({ preventScroll: true }); panel.scrollIntoView?.({ block: 'start' }); }
    });
    effect(onCleanup => {
      const user = this.identity.currentUser(); const id = this.id();
      const scope = new Subscription(); this.active = scope;
      onCleanup(() => scope.unsubscribe());
      untracked(() => {
        this.course.set(null); this.sessions.set([]); this.loading.set(false); this.saving.set(false);
        this.page.set(0);
        this.feedback.set(''); this.formOpen.set(false); this.editingId.set(null); this.form.reset();
        this.weekly.set(false); this.scheduleForm.reset(); this.showAllPreview.set(false);
        if (!user || !id) return;
        if (user.role !== 'ADMIN' && user.role !== 'INSTRUCTOR') { this.feedback.set('No tienes permisos para gestionar sesiones.'); return; }
        this.loading.set(true);
        scope.add(this.api.list(id).subscribe({
          next: data => { this.course.set(data.course); this.sessions.set(data.sessions); this.loading.set(false); },
          error: error => { this.feedback.set(this.errorMessage(error)); this.loading.set(false); }
        }));
      });
    });
  }
  openSchedule() {
    if (!this.canManage() || !this.course() || this.saving()) return;
    const course = this.course()!;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const start = course.startDate ?? today;
    this.scheduleForm.reset({ startDate: start, endDate: course.endDate && course.endDate >= start ? course.endDate : start, weekdays: [new Date(start).getUTCDay()], startTime: '18:00', durationMinutes: 60 });
    this.weekly.set(true); this.editingId.set(null); this.feedback.set(''); this.showAllPreview.set(false); this.formOpen.set(true);
  }
  toggleDay(day: number) { const control = this.scheduleForm.controls.weekdays; control.setValue(control.value.includes(day) ? control.value.filter(value => value !== day) : [...control.value, day]); control.markAsTouched(); }
  submitSchedule() {
    if (!this.canManage()) return;
    this.scheduleForm.markAllAsTouched();
    if (this.scheduleForm.invalid || this.saving() || !this.course() || !this.formOpen() || !this.weekly()) return;
    this.saving.set(true); this.feedback.set('');
    this.active.add(this.api.schedule(this.id(), this.scheduleForm.getRawValue()).subscribe({
      next: result => {
        this.sessions.set(result.sessions); this.saving.set(false); this.formOpen.set(false);
        this.feedback.set(`Se ${result.createdCount === 1 ? 'creó 1 sesión' : `crearon ${result.createdCount} sesiones`}. ${result.skippedCount ? `Se ${result.skippedCount === 1 ? 'omitió 1 sesión que ya existía' : `omitieron ${result.skippedCount} sesiones que ya existían`}.` : 'La agenda está actualizada.'}`);
      },
      error: error => { this.saving.set(false); this.feedback.set(this.errorMessage(error)); }
    }));
  }
  openCreate() { if (!this.canManage() || !this.course() || this.saving()) return; this.weekly.set(false); this.editingId.set(null); this.form.reset({ date: '', startTime: '', durationMinutes: 60 }); this.feedback.set(''); this.formOpen.set(true); }
  openEdit(session: CourseSession) { if (!this.canManage() || !this.course() || this.saving()) return; this.weekly.set(false); this.editingId.set(session.id); this.form.setValue({ date: session.date, startTime: session.startTime, durationMinutes: session.durationMinutes }); this.feedback.set(''); this.formOpen.set(true); }
  closeForm() { if (!this.saving()) this.formOpen.set(false); }
  submit() {
    if (!this.canManage()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving() || !this.course() || !this.formOpen()) return;
    this.saving.set(true); this.feedback.set('');
    const payload = this.form.getRawValue(); const id = this.editingId();
    const request = id ? this.api.update(this.id(), id, payload) : this.api.create(this.id(), payload);
    this.active.add(request.subscribe({
      next: saved => {
        this.sessions.update(rows => [...rows.filter(row => row.id !== saved.id), saved].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || Number(a.id) - Number(b.id)));
        this.saving.set(false); this.formOpen.set(false); this.feedback.set('Sesión guardada correctamente.');
      },
      error: error => { this.saving.set(false); this.feedback.set(this.errorMessage(error)); }
    }));
  }
  private errorMessage(error: { error?: { message?: string; fields?: { message: string }[] } }) { return error.error?.fields?.length ? error.error.fields.map(field => field.message).join(' ') : error.error?.message ?? 'No se pudo completar la operación. Inténtalo de nuevo.'; }
}
