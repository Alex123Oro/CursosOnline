import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../shared/http-error.js';
import { certificateTemplateSnapshotSchema, type certificateTemplateInputSchema, type certificateTemplateUpdateSchema } from './certificate-template.rules.js';
import type { z } from 'zod';
type Row = { id: string; name: string; type: 'aprobacion'|'participacion'; config: unknown; version: number; updatedAt: Date };
const dto = (row: Row) => ({ ...row, ...certificateTemplateSnapshotSchema.parse(row), updatedAt: row.updatedAt.toISOString() });
export const certificateTemplateService = {
  async list() {
    const rows = await prisma.$queryRaw<Row[]>`SELECT id::text AS id,nombre AS name,tipo AS type,config,version,actualizado_en AS "updatedAt" FROM public.plantillas_certificados ORDER BY actualizado_en DESC,id DESC`;
    return rows.map(dto);
  },
  async create(input: z.infer<typeof certificateTemplateInputSchema>, actorId: string) {
    const [row] = await prisma.$queryRaw<Row[]>`INSERT INTO public.plantillas_certificados(nombre,tipo,config,creado_por,actualizado_por)
      VALUES(${input.name},${input.type},${JSON.stringify(input.config)}::jsonb,${BigInt(actorId)},${BigInt(actorId)})
      RETURNING id::text AS id,nombre AS name,tipo AS type,config,version,actualizado_en AS "updatedAt"`;
    return dto(row!);
  },
  async update(id: string, input: z.infer<typeof certificateTemplateUpdateSchema>, actorId: string) {
    const [row] = await prisma.$queryRaw<Row[]>`UPDATE public.plantillas_certificados SET nombre=${input.name},tipo=${input.type},config=${JSON.stringify(input.config)}::jsonb,
      version=version+1,actualizado_por=${BigInt(actorId)},actualizado_en=now() WHERE id=${BigInt(id)} AND version=${input.version}
      RETURNING id::text AS id,nombre AS name,tipo AS type,config,version,actualizado_en AS "updatedAt"`;
    if (!row) throw new HttpError(409, 'La plantilla cambió o ya no existe. Recarga la lista antes de guardar.');
    return dto(row);
  }
};
