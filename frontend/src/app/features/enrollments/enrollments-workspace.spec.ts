import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signal } from '@angular/core';
import { routes } from '../../app.routes';
import { SessionService } from '../../core/session.service';
import { environment } from '../../../environments/environment';
const base = `${environment.apiBaseUrl}/enrollments`;
const summaries = [
  {
    id: '7',
    name: 'Scrum',
    code: 'S-2026',
    capacity: 20,
    status: 'DRAFT',
    preenrolledCount: 2,
    enrolledCount: 1,
  },
];
const row = {
  id: '9',
  status: 'PREINSCRITO',
  participantName: 'Carla',
  participantEmail: 'carla@test',
  courseId: '7',
  courseName: 'Scrum',
  courseCode: 'S-2026',
  participantTypeName: 'Estudiante',
  basePrice: 100,
  finalAmount: 100,
  benefitAmount: 0,
  scholarshipPercent: 0,
  scholarshipActive: false,
  paymentStatus: 'PAGADO',
  paymentAmount: 100,
  createdAt: '2026-10-14',
  confirmedAt: null,
};
describe('enrollments by course', () => {
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter(
          routes
            .filter((route) => !route.redirectTo)
            .map((route) => ({ ...route, canActivate: [] }))
        ),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { currentUser: signal({ id: '1', role: 'ADMIN' }) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const flushPage = (http: HttpTestingController, status = 'PREINSCRITO') => {
    const request = http.expectOne(
      (req) =>
        req.url === base &&
        req.params.get('courseId') === '7' &&
        req.params.get('status') === status
    );
    request.flush({ items: [{ ...row, status }], total: 1, page: 1, pageSize: 20, totalPages: 1 });
  };
  it('initially asks for a course and never fetches the global participant list', async () => {
    const harness = await RouterTestingHarness.create('/inscripciones');
    http.expectOne(`${base}/courses`).flush(summaries);
    harness.detectChanges();
    http.expectNone((req) => req.url === base);
    expect(harness.routeNativeElement?.textContent).toContain(
      'Selecciona un curso para ver sus participantes'
    );
  });
  it('loads the URL scope and retains the course when switching tabs', async () => {
    const harness = await RouterTestingHarness.create('/inscripciones?curso=7&estado=preinscritos');
    http.expectOne(`${base}/courses`).flush(summaries);
    flushPage(http);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Carla');
    const tabs = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('.enrollment-tabs a'),
    ];
    tabs.find((tab) => tab.textContent?.trim() === 'Inscritos')!.click();
    await harness.fixture.whenStable();
    flushPage(http, 'INSCRITO');
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toContain('curso=7');
    expect(harness.routeNativeElement?.querySelector('th.confirmed-column')).not.toBeNull();
  });
  it('opens a dedicated detail and returns to the same course, search and page', async () => {
    const context = '/inscripciones?curso=7&estado=preinscritos&buscar=Carla&pagina=2';
    const harness = await RouterTestingHarness.create(context);
    http.expectOne(`${base}/courses`).flush(summaries);
    http
      .expectOne((req) => req.url === base && req.params.get('page') === '2')
      .flush({ items: [row], total: 21, page: 2, pageSize: 20, totalPages: 2 });
    harness.detectChanges();
    harness.routeNativeElement!.querySelector<HTMLAnchorElement>('a.manage')!.click();
    await harness.fixture.whenStable();
    http.expectOne(`${base}/9`).flush(row);
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Carla');
    harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.back-link')!.click();
    await harness.fixture.whenStable();
    http.expectOne(`${base}/courses`).flush(summaries);
    const req = http.expectOne((req) => req.url === base);
    expect(req.request.params.get('search')).toBe('Carla');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ items: [row], total: 21, page: 2, pageSize: 20, totalPages: 2 });
  });
  it('retains a failed payment for retry and preserves the list context after saving', async () => {
    const harness = await RouterTestingHarness.create(
      '/inscripciones/9?curso=7&estado=preinscritos&buscar=Carla&pagina=2'
    );
    http.expectOne(`${base}/9`).flush(row);
    harness.detectChanges();
    const button = (label: string) =>
      [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')].find(
        (item) => item.textContent?.trim() === label
      )!;
    button('Registrar movimiento').click();
    harness.detectChanges();
    const amount = harness.routeNativeElement!.querySelector<HTMLInputElement>(
      'input[formControlName="amount"]'
    )!;
    amount.value = '60';
    amount.dispatchEvent(new Event('input'));
    harness.detectChanges();
    button('Guardar pago').click();
    harness.detectChanges();
    const failed = http.expectOne(`${base}/9/payment-movements`);
    expect(failed.request.body).toMatchObject({ amount: 60, kind: 'ABONO', requestId: expect.any(String) });
    failed.flush({ message: 'Error temporal' }, { status: 503, statusText: 'Unavailable' });
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('Error temporal');
    expect(amount.value).toBe('60');
    expect(button('Guardar pago').disabled).toBe(false);
    button('Guardar pago').click();
    http
      .expectOne(`${base}/9/payment-movements`)
      .flush({ ...row, paymentAmount: 60, paymentStatus: 'PARCIAL' });
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('Movimiento registrado. El historial anterior se conserva.');
    expect(
      harness.routeNativeElement!.querySelector<HTMLAnchorElement>('.back-link')!.search
    ).toContain('pagina=2');
    expect(TestBed.inject(Router).url).toContain('buscar=Carla');
  });
  it('saves a scholarship and opens refreshed enrolled counts after confirmation', async () => {
    const harness = await RouterTestingHarness.create(
      '/inscripciones/9?curso=7&estado=preinscritos&pagina=1'
    );
    http.expectOne(`${base}/9`).flush(row);
    harness.detectChanges();
    const button = (label: string) =>
      [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')].find(
        (item) => item.textContent?.trim() === label
      )!;
    button('Asignar beca').click();
    harness.detectChanges();
    for (const [control, value] of [
      ['scholarshipPercent', '100'],
      ['reason', 'Apoyo académico'],
    ]) {
      const input = harness.routeNativeElement!.querySelector<HTMLInputElement>(
        `[formControlName="${control}"]`
      )!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    harness.detectChanges();
    button('Guardar beca').click();
    const scholarship = http.expectOne(`${base}/9/scholarship`);
    expect(scholarship.request.body).toEqual({
      scholarshipPercent: 100,
      reason: 'Apoyo académico',
    });
    const freeRow = {
      ...row,
      finalAmount: 0,
      benefitAmount: 100,
      scholarshipPercent: 100,
      scholarshipActive: true,
      paymentStatus: 'NO_REQUIERE',
    };
    scholarship.flush(freeRow);
    harness.detectChanges();
    button('Confirmar inscripción').click();
    harness.detectChanges();
    button('Confirmar ahora').click();
    http
      .expectOne(`${base}/9/confirm`)
      .flush({ ...freeRow, status: 'INSCRITO', confirmedAt: '2026-10-14T12:00:00Z' });
    harness.detectChanges();
    const link = [
      ...harness.routeNativeElement!.querySelectorAll<HTMLAnchorElement>('.feedback a'),
    ][0];
    link.click();
    await harness.fixture.whenStable();
    http
      .expectOne(`${base}/courses`)
      .flush([{ ...summaries[0], preenrolledCount: 1, enrolledCount: 2 }]);
    flushPage(http, 'INSCRITO');
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toContain('estado=inscritos');
    expect(TestBed.inject(Router).url).toContain('curso=7');
    expect(harness.routeNativeElement!.textContent).toContain('Carla');
  });
  it('paginates scoped results and distinguishes an empty course from a failed request', async () => {
    const harness = await RouterTestingHarness.create('/inscripciones?curso=7&estado=preinscritos');
    http.expectOne(`${base}/courses`).flush(summaries);
    http
      .expectOne((req) => req.url === base)
      .flush({ items: [row], total: 21, page: 1, pageSize: 20, totalPages: 2 });
    harness.detectChanges();
    const button = (label: string) =>
      [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')].find(
        (item) => item.textContent?.trim() === label
      )!;
    button('Siguiente').click();
    await harness.fixture.whenStable();
    const next = http.expectOne((req) => req.url === base);
    expect(next.request.params.get('page')).toBe('2');
    expect(next.request.params.get('courseId')).toBe('7');
    next.flush({ message: 'No disponible' }, { status: 503, statusText: 'Unavailable' });
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('No disponible');
    button('Reintentar').click();
    harness.detectChanges();
    http
      .expectOne((req) => req.url === base)
      .flush({ items: [], total: 0, page: 2, pageSize: 20, totalPages: 2 });
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('No hay preinscritos');
  });
  it('cancels an operation when moving to a different enrollment detail', async () => {
    const harness = await RouterTestingHarness.create('/inscripciones/9?curso=7');
    http.expectOne(`${base}/9`).flush({ ...row, paymentAmount: 0, paymentStatus: 'PENDIENTE' });
    harness.detectChanges();
    const button = (label: string) =>
      [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')].find(
        (item) => item.textContent?.trim() === label
      )!;
    button('Registrar movimiento').click();
    harness.detectChanges();
    button('Guardar pago').click();
    const pending = http.expectOne(`${base}/9/payment-movements`);
    await harness.navigateByUrl('/inscripciones/10?curso=7');
    http.expectOne(`${base}/10`).flush({ ...row, id: '10', participantName: 'Luis' });
    harness.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(button('Registrar movimiento').disabled).toBe(false);
    expect(harness.routeNativeElement!.querySelector('h1')?.textContent).toContain('Luis');
  });
});
