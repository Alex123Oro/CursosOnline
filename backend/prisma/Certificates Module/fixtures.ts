import { defaultCertificateTemplate, certificateTemplateInputSchema } from '../../src/modules/certificates/certificate-template.rules.js';

export const seedId = 'eva-sprint3-certificates-v1';
export const demoLabel = 'DEMOSTRACION SIN VALIDEZ ACADEMICA';
export const accounts = [
  { key: 'admin', name: 'Administración Demo Certificados', role: 'ADMIN' as const },
  { key: 'instructor', name: 'Carla Mendoza Demo Certificados', role: 'INSTRUCTOR' as const },
  ...[
    'Ana Emisión Individual', 'Bruno Límite Exacto', 'Carla Emisión Lote',
    'Diego Nota Insuficiente', 'Elena Asistencia Insuficiente', 'Fabio Nota Pendiente',
    'Gabriela Aprobación Emitida', 'Hugo Participación Emitida', 'Inés Certificado Anulado',
    'Jorge Historial Reemisión', 'Karla Solo Preinscrita', 'Luis Sin Certificados'
  ].map((name, i) => ({ key: `p${String(i + 1).padStart(2, '0')}`, name, role: 'PARTICIPANT' as const }))
].map(a => ({ ...a, email: `s3.cert.${a.key}@example.com` }));
export type DemoAccount = (typeof accounts)[number];
export type CourseKey = 'main' | 'future' | 'no-sessions' | 'no-duration';
export type DemoEnrollment = {
  key: string; course: CourseKey; participant: string; status: 'INSCRITO' | 'PREINSCRITO';
  present: number; grades: [number | null, number | null];
};

export function laPazToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function shiftDate(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw new Error('Fecha de demo inválida.');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function buildFixtures(today: string) {
  const date = (offset: number) => shiftDate(today, offset);
  const definitions = [
    { key: 'main' as const, suffix: '01', title: 'Certificación de PostgreSQL', offsets: [-10, -9, -8, -7, -6], start: -10, end: -5, duration: 10 },
    { key: 'future' as const, suffix: '02', title: 'Curso en desarrollo', offsets: [-2, -1, 1, 2, 3], start: -2, end: 3, duration: 10 },
    { key: 'no-sessions' as const, suffix: '03', title: 'Curso sin sesiones', offsets: [], start: -10, end: -5, duration: 10 },
    { key: 'no-duration' as const, suffix: '04', title: 'Curso sin duración', offsets: [-10, -9, -8, -7, -6], start: -10, end: -5, duration: null }
  ];
  const courses = definitions.map(c => ({
    key: c.key, code: `DEMO-S3-CERT-${c.suffix}`, name: `${c.title} · ${demoLabel}`,
    startDate: date(c.start), endDate: date(c.end), durationHours: c.duration,
    preinscriptionStart: date(-30), preinscriptionEnd: date(-15),
    sessions: c.offsets.map((offset, i) => ({ number: i + 1, date: date(offset), startTime: '18:00', durationMinutes: 120 })),
    evaluations: [{ title: 'Práctica', weight: 40, maxScore: 100 }, { title: 'Evaluación final', weight: 60, maxScore: 100 }]
  }));
  const main: DemoEnrollment[] = [
    ['p01', 5, 90, 90], ['p02', 4, 70, 70], ['p03', 5, 85, 85],
    ['p04', 5, 60, 60], ['p05', 3, 90, 90], ['p06', 5, 90, null],
    ['p07', 5, 90, 90], ['p08', 5, null, null], ['p09', 5, 90, 90],
    ['p10', 5, 90, 90], ['p11', 5, 90, 90]
  ].map(([participant, present, a, b]) => ({
    key: `main-${participant}`, course: 'main', participant: participant as string,
    status: participant === 'p11' ? 'PREINSCRITO' : 'INSCRITO', present: present as number,
    grades: [a as number | null, b as number | null]
  }));
  const enrollments: DemoEnrollment[] = [...main,
    { key: 'future-p01', course: 'future', participant: 'p01', status: 'INSCRITO', present: 2, grades: [90, 90] },
    { key: 'future-p12', course: 'future', participant: 'p12', status: 'INSCRITO', present: 2, grades: [90, 90] },
    { key: 'no-sessions-p01', course: 'no-sessions', participant: 'p01', status: 'INSCRITO', present: 0, grades: [90, 90] },
    { key: 'no-duration-p01', course: 'no-duration', participant: 'p01', status: 'INSCRITO', present: 5, grades: [90, 90] }
  ];
  const templates = (['aprobacion', 'participacion'] as const).map(type => ({
    key: `${seedId}-${type}`,
    ...certificateTemplateInputSchema.parse({ name: `DEMO S3 · ${type}`, type,
      config: { ...defaultCertificateTemplate(type), layout: type === 'aprobacion' ? 'classic' : 'modern',
        footer: 'DEMOSTRACION SIN VALIDEZ ACADEMICA. Documento sin firma criptográfica.' } })
  }));
  return { today, courses, enrollments, templates };
}
export type DemoFixtures = ReturnType<typeof buildFixtures>;
