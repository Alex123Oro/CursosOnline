import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { boliviaToday } from '../attendance/attendance.rules.js';
export const activeEnrollmentStatuses = ['PREINSCRITO', 'INSCRITO'] as const;
export async function expireCourseReservations(tx: Prisma.TransactionClient, courseId: number) {
  const rows = await tx.enrollment.findMany({ where: { courseId, status: 'PREINSCRITO',
    course: { preinscriptionEnd: { lt: new Date(boliviaToday()) } },
    OR: [{ payment: { is: null } }, { payment: { is: { amount: { lte: 0 } } } }]
  }, select: { id: true } });
  if (!rows.length) return 0;
  const reason = 'Terminó el periodo de preinscripción sin pago registrado.';
  await tx.enrollment.updateMany({ where: { id: { in: rows.map(row => row.id) }, status: 'PREINSCRITO' }, data: { status: 'CADUCADO', closedAt: new Date(), closureReason: reason } });
  await tx.enrollmentEvent.createMany({ data: rows.map(row => ({ enrollmentId: row.id, status: 'CADUCADO', reason })) });
  return rows.length;
}
export async function expireDueReservations() {
  const courses = await prisma.course.findMany({ where: { preinscriptionEnd: { lt: new Date(boliviaToday()) },
    enrollments: { some: { status: 'PREINSCRITO', OR: [{ payment: { is: null } }, { payment: { is: { amount: { lte: 0 } } } }] } }
  }, select: { id: true } });
  let count = 0;
  for (const course of courses) count += await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM cursos WHERE id=${course.id} FOR UPDATE`;
    return expireCourseReservations(tx, course.id);
  });
  return count;
}
export function startReservationExpiry() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await expireDueReservations(); } catch { console.error('reservation_expiry_unavailable'); } finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(), 60000);
  timer.unref();
  return timer;
}
