import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { SessionService } from '../../core/session.service';
import { InstructorAttendanceService, InstructorAttendanceRow, InstructorOption } from '../../core/instructor-attendance.service';
import type { AttendanceStatus } from '../../core/attendance.service';
type StateFilter = 'ALL' | 'PRESENT' | 'ABSENT' | 'PENDING';
interface RowState { phase: 'saving' | 'saved' | 'error'; target: AttendanceStatus; message?: string; }
@Component({ selector: 'app-instructor-attendance-page', standalone: true, templateUrl: './instructor-attendance-page.html', styleUrl: './instructor-attendance-page.scss' })
export class InstructorAttendancePage {
  readonly identity = inject(SessionService);
  private readonly api = inject(InstructorAttendanceService);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);
  private active = new Subscription();
  readonly instructors = signal<InstructorOption[]>([]);
  readonly instructorId = signal('');
  readonly selectedInstructor = computed(() => this.instructors().find(instructor => instructor.id === this.instructorId()));
  readonly courses = signal<InstructorAttendanceRow['course'][]>([]);
  readonly courseId = signal(''); readonly from = signal(''); readonly to = signal('');
  readonly stateFilter = signal<StateFilter>('PENDING');
  readonly sessions = signal<InstructorAttendanceRow[]>([]);
  private readonly today = signal('');
  readonly loading = signal(false); readonly error = signal('');
  readonly rowState = signal<Record<string, RowState>>({});
  private readonly page = signal(0);
  readonly filteredSessions = computed(() => this.sessions().filter(row => this.stateFilter() === 'ALL' || (this.stateFilter() === 'PENDING' ? row.date <= this.today() && !row.status : row.status === this.stateFilter())));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredSessions().length / 8)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1));
  readonly visibleSessions = computed(() => this.filteredSessions().slice(this.currentPage() * 8, (this.currentPage() + 1) * 8));
  readonly summary = computed(() => {
    const rows = this.filteredSessions().filter(row => row.date <= this.today());
    return { present: rows.filter(row => row.status === 'PRESENT').length, absent: rows.filter(row => row.status === 'ABSENT').length, pending: rows.filter(row => !row.status).length };
  });
  constructor() {
    this.api.saveSettled.pipe(takeUntilDestroyed()).subscribe(event => {
      if (this.identity.currentUser()?.role === 'ADMIN' && this.instructorId() === event.instructorId && this.rowState()[event.sessionId]?.phase !== 'saving') this.reload();
    });
    effect(onCleanup => {
      const user = this.identity.currentUser(), query = this.query();
      onCleanup(() => this.active.unsubscribe());
      untracked(() => {
        this.cancel(); this.instructors.set([]); this.courses.set([]); this.instructorId.set(''); this.courseId.set(''); this.from.set(''); this.to.set(''); this.stateFilter.set('PENDING'); this.error.set(''); this.loading.set(false);
        if (!user) return;
        if (user.role !== 'ADMIN') { this.error.set('Solo el administrador puede gestionar asistencia de instructores.'); return; }
        this.loading.set(true);
        this.active.add(this.api.instructors().subscribe({ next: instructors => {
          this.instructors.set(instructors);
          const selected = instructors.find(row => row.id === query?.get('instructor')) ?? instructors[0];
          this.instructorId.set(selected?.id ?? ''); this.courseId.set(query?.get('course') ?? '');
          if (selected) this.load(); else this.loading.set(false);
        }, error: error => { this.loading.set(false); this.error.set(this.message(error)); } }));
      });
    });
  }
  private cancel() { this.active.unsubscribe(); this.active = new Subscription(); this.rowState.set({}); this.sessions.set([]); this.page.set(0); }
  private load() {
    this.loading.set(false); this.error.set('');
    if (!this.instructorId() || this.identity.currentUser()?.role !== 'ADMIN') return;
    if (this.from() && this.to() && this.from() > this.to()) { this.error.set('Hasta debe ser igual o posterior a Desde.'); return; }
    this.loading.set(true);
    this.active.add(this.api.list(this.instructorId(), { courseId: this.courseId(), from: this.from(), to: this.to() }).subscribe({ next: data => {
      this.today.set(data.today); this.sessions.set(data.sessions); this.courses.set(data.courses); this.loading.set(false);
    }, error: error => { this.loading.set(false); this.error.set(this.message(error)); } }));
  }
  reload() {
    this.cancel();
    if (!this.instructors().length && this.identity.currentUser()?.role === 'ADMIN') {
      this.loading.set(true);
      this.active.add(this.api.instructors().subscribe({ next: instructors => { this.instructors.set(instructors); this.instructorId.set(instructors[0]?.id ?? ''); if (this.instructorId()) this.load(); else this.loading.set(false); }, error: error => { this.loading.set(false); this.error.set(this.message(error)); } }));
    } else this.load();
  }
  selectInstructor(id: string) { if (!this.instructors().some(row => row.id === id) || id === this.instructorId()) return; this.cancel(); this.instructorId.set(id); this.courseId.set(''); this.courses.set([]); this.load(); }
  setFilter(field: 'courseId' | 'from' | 'to', value: string) { this.cancel(); this[field].set(value); this.load(); }
  setStateFilter(value: string) { if (!['ALL','PRESENT','ABSENT','PENDING'].includes(value)) return; this.cancel(); this.stateFilter.set(value as StateFilter); this.load(); }
  changePage(delta: number) { this.page.set(Math.max(0, Math.min(this.currentPage() + delta, this.pageCount() - 1))); }
  mark(row: InstructorAttendanceRow, status: AttendanceStatus) {
    if (this.identity.currentUser()?.role !== 'ADMIN' || this.loading() || !row.editable || !this.sessions().some(session => session.id === row.id) || this.rowState()[row.id]?.phase === 'saving') return;
    this.rowState.update(rows => ({ ...rows, [row.id]: { phase: 'saving', target: status } }));
    this.active.add(this.api.save(this.instructorId(), row.id, status).subscribe({ next: saved => {
      this.sessions.update(rows => rows.map(session => session.id === saved.id ? saved : session));
      this.rowState.update(rows => ({ ...rows, [row.id]: { phase: 'saved', target: status } }));
    }, error: error => { this.rowState.update(rows => ({ ...rows, [row.id]: { phase: 'error', target: status, message: this.message(error) } })); } }));
  }
  retry(row: InstructorAttendanceRow) { const state = this.rowState()[row.id]; if (state?.phase === 'error') this.mark(row, state.target); }
  formatDate(date: string) { return new Intl.DateTimeFormat('es-BO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)); }
  private message(error: { error?: { message?: string } }) { return error.error?.message ?? 'No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.'; }
}
