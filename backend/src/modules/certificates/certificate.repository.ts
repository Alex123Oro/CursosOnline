import { getServerSupabase } from '../../config/supabase.js';
import { HttpError } from '../../shared/http-error.js';
import type { Certificate, CertificateRoster } from './certificate.types.js';
import { certificateDatabaseId } from './certificate-id.js';

type DataError = { code?: string; message?: string; details?: string };
export class CertificateCodeCollision extends Error {}
export const certificateDataError = (error: DataError): never => {
  if (error.code === 'P0410') throw new HttpError(400, 'La plantilla no está disponible para este tipo de certificado.');
  if (error.code === '23505') {
    // Distinguish the code index from the result/enrollment unique index.
    if (/certificados_codigo_verificacion_key/.test(`${error.message} ${error.details}`)) {
      throw new CertificateCodeCollision();
    }
    throw new HttpError(409, 'Ya se emitió un certificado para esta inscripción.');
  }
  if (error.code === 'P0404') throw new HttpError(404, 'Inscripción o curso no encontrado.');
  if (error.code === 'P0409') throw new HttpError(409, 'Ya se emitió un certificado para esta inscripción.');
  if (error.code === 'P0400') throw new HttpError(400, 'No se puede emitir: el participante no ha cumplido los requisitos del tipo de certificado seleccionado o faltan datos del curso.');
  if (error.code === 'P0403') throw new HttpError(403, 'No tiene permisos para emitir certificados.');
  // Never return raw PostgREST errors, credentials or SQL details to the caller.
  throw new HttpError(503, 'No se pudo consultar certificados. Comprueba la configuración y la migración del módulo.');
};

const fields = 'id,codigo_verificacion,tipo,fecha_emision,estado,datos_emision,anulaciones_certificados(id)';
const ownedFields = `${fields},resultados_curso!inner(inscripciones!inner(participante_id))`;

export const certificateRepository = {
  async courses() {
    const { data, error } = await getServerSupabase().from('cursos').select('id,nombre,codigo').order('nombre');
    if (error) certificateDataError(error);
    return (data ?? []).map(row => ({ id: certificateDatabaseId(row.id), name: String(row.nombre), code: String(row.codigo ?? '') }));
  },
  async roster(courseId: string, type: Certificate['type'] = 'aprobacion'): Promise<CertificateRoster> {
    const { data, error } = await getServerSupabase().rpc('certificate_candidates_for_type', { p_course_id: courseId, p_type: type });
    if (error) certificateDataError(error);
    if (!data) throw new HttpError(404, 'Curso no encontrado.');
    return data as CertificateRoster;
  },
  async issue(enrollmentId: string, code: string, publicUrl: string, actorId: string, type: Certificate['type'] = 'aprobacion', templateId?: string) {
    const { data, error } = await getServerSupabase().rpc(templateId ? 'emit_certificate_with_template' : 'emit_certificate_for_type', {
      ...(templateId ? { p_template_id: templateId } : {}),
      p_enrollment_id: enrollmentId, p_code: code, p_public_url: publicUrl, p_actor_id: actorId, p_type: type
    });
    if (error) certificateDataError(error);
    return data;
  },
  async verify(code: string) {
    const { data, error } = await getServerSupabase().from('certificados').select(fields)
      .eq('codigo_verificacion', code).maybeSingle();
    if (error) certificateDataError(error);
    return data;
  },
  async mine(participantId: string) {
    const { data, error } = await getServerSupabase().from('certificados').select(ownedFields)
      .eq('resultados_curso.inscripciones.participante_id', participantId).order('fecha_emision', { ascending: false });
    if (error) certificateDataError(error);
    return data ?? [];
  },
  async owned(id: string, participantId: string) {
    const { data, error } = await getServerSupabase().from('certificados').select(ownedFields)
      .eq('id', id).eq('resultados_curso.inscripciones.participante_id', participantId).maybeSingle();
    if (error) certificateDataError(error);
    return data;
  }
};
