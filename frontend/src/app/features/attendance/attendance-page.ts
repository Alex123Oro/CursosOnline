import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, Subscription } from 'rxjs';
import { AttendanceData, AttendanceService, AttendanceStatus, AttendanceStudent } from '../../core/attendance.service';
import { SessionService } from '../../core/session.service';

interface RowState { phase: 'saving' | 'saved' | 'error'; target: AttendanceStatus; message?: string; }
@Component({ selector: 'app-attendance-page', standalone: true, imports: [RouterLink], templateUrl: './attendance-page.html', styleUrl: './attendance-page.scss' })
export class AttendancePage {
  private readonly api = inject(AttendanceService);
  readonly identity = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  readonly courseId = toSignal(this.route.paramMap.pipe(map(params => params.get('courseId') ?? '')), { initialValue: '' });
  private readonly requestedSession = toSignal(this.route.queryParamMap.pipe(map(params => params.get('session') ?? '')), { initialValue: '' });
  private active = new Subscription();
  readonly course = signal<AttendanceData['course'] | null>(null);
  readonly sessions = signal<AttendanceData['sessions']>([]);
  readonly students = signal<AttendanceStudent[]>([]);
  readonly sessionId = signal('');
  readonly selectedSession = computed(() => this.sessions().find(session => session.id === this.sessionId()) ?? null);
  readonly rowState = signal<Record<string, RowState>>({});
  readonly anySaving = computed(() => Object.values(this.rowState()).some(row => row.phase === 'saving'));
  readonly loading = signal(false);
  readonly error = signal('');
  readonly search = signal('');
  private readonly page = signal(0);
  readonly filteredStudents = computed(() => {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const query = normalize(this.search().trim());
    return this.students().filter(student => normalize(student.name).includes(query));
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredStudents().length / 8)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1));
  readonly visibleStudents = computed(() => this.filteredStudents().slice(this.currentPage() * 8, (this.currentPage() + 1) * 8));
  readonly sessionCounts = computed(() => {
    const present = this.students().filter(student => this.statusFor(student) === 'PRESENT').length;
    const absent = this.students().filter(student => this.statusFor(student) === 'ABSENT').length;
    return { present, absent, unmarked: this.students().length - present - absent };
  });
  constructor() {
    effect(onCleanup => {
      const user = this.identity.currentUser(), courseId = this.courseId(), requested = this.requestedSession();
      onCleanup(() => this.active.unsubscribe());
      untracked(() => {
        this.resetRequests(); this.course.set(null); this.students.set([]); this.sessions.set([]); this.sessionId.set('');
        this.search.set(''); this.page.set(0); this.error.set(''); this.loading.set(false);
        if (!user || !courseId) return;
        if (user.role !== 'ADMIN' && user.role !== 'INSTRUCTOR') { this.error.set('No tienes permisos para gestionar asistencia.'); return; }
        this.load(requested);
      });
    });
  }
  private resetRequests() { this.active.unsubscribe(); this.active = new Subscription(); this.rowState.set({}); }
  private load(preferred = this.sessionId()) {
    this.loading.set(true); this.error.set('');
    this.active.add(this.api.list(this.courseId()).subscribe({
      next: data => {
        this.course.set(data.course); this.sessions.set(data.sessions); this.students.set(data.students);
        const selected = data.sessions.find(session => session.id === preferred)
          ?? data.sessions.find(session => session.date === data.today)
          ?? data.sessions.filter(session => session.editable).at(-1) ?? data.sessions[0];
        this.sessionId.set(selected?.id ?? ''); this.loading.set(false);
      },
      error: error => { this.course.set(null); this.students.set([]); this.sessions.set([]); this.loading.set(false); this.error.set(this.errorMessage(error)); }
    }));
  }
  reload() { this.resetRequests(); this.load(); }
  selectSession(id: string) {
    if (id === this.sessionId() || !this.sessions().some(session => session.id === id)) return;
    this.resetRequests(); this.sessionId.set(id); this.page.set(0); this.load(id);
  }
  setSearch(value: string) { this.search.set(value); this.page.set(0); }
  changePage(delta: number) { this.page.set(Math.max(0, Math.min(this.currentPage() + delta, this.pageCount() - 1))); }
  statusFor(student: AttendanceStudent) { return student.attendance.find(record => record.sessionId === this.sessionId())?.status ?? null; }
  mark(student: AttendanceStudent, status: AttendanceStatus) {
    const user = this.identity.currentUser();
    if (!user || (user.role !== 'ADMIN' && user.role !== 'INSTRUCTOR') || !this.course() || this.loading() || !this.selectedSession()?.editable || this.rowState()[student.enrollmentId]?.phase === 'saving') return;
    this.rowState.update(rows => ({ ...rows, [student.enrollmentId]: { phase: 'saving', target: status } }));
    this.active.add(this.api.save(this.courseId(), this.sessionId(), student.enrollmentId, status).subscribe({
      next: saved => {
        this.students.update(students => students.map(row => row.enrollmentId === saved.enrollmentId ? saved : row));
        this.rowState.update(rows => ({ ...rows, [student.enrollmentId]: { phase: 'saved', target: status } }));
      },
      error: error => { this.rowState.update(rows => ({ ...rows, [student.enrollmentId]: { phase: 'error', target: status, message: this.errorMessage(error) } })); }
    }));
  }
  retry(student: AttendanceStudent) { const state = this.rowState()[student.enrollmentId]; if (state?.phase === 'error') this.mark(student, state.target); }
  formatDate(date: string) { return new Intl.DateTimeFormat('es-BO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)); }
  private errorMessage(error: { error?: { message?: string } }) { return error.error?.message ?? 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'; }
}
