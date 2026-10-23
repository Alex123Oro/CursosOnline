import type { Prisma } from '@prisma/client';
import { HttpError } from './http-error.js';

export async function ensureAcademicEditable(tx: Prisma.TransactionClient, courseId: number, enrollmentId?: number) {
  const [state] = await tx.$queryRaw<{ issued: boolean }[]>`SELECT EXISTS(
    SELECT 1 FROM public.certificados c JOIN public.resultados_curso r ON r.id=c.resultado_curso_id
    JOIN public.inscripciones i ON i.id=r.inscripcion_id
    WHERE i.curso_id=${courseId} AND (${enrollmentId ?? null}::bigint IS NULL OR i.id=${enrollmentId ?? null})
      AND c.estado::text='valido' AND NOT EXISTS(SELECT 1 FROM public.anulaciones_certificados a WHERE a.certificado_id=c.id)
  ) AS issued`;
  if (state?.issued) throw new HttpError(409, 'Hay un certificado vigente afectado por este cambio. Administración debe anularlo con motivo antes de corregir los datos académicos.');
}

export async function invalidateAcademicResults(tx: Prisma.TransactionClient, courseId: number, enrollmentId?: number) {
  await tx.courseResult.updateMany({ where: { courseId, ...(enrollmentId ? { enrollmentId } : {}) },
    data: { status: 'PENDING', finalScore: null, attendancePercent: null, calculatedAt: null } });
}
