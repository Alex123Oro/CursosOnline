import { beforeEach, describe, expect, it, vi } from 'vitest';
const { db, query } = vi.hoisted(() => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const key of ['select','eq','order','maybeSingle']) query[key] = vi.fn();
  return { db: { from: vi.fn(), rpc: vi.fn() }, query };
});
vi.mock('../src/config/supabase.js', () => ({ getServerSupabase: () => db }));
import { CertificateCodeCollision, certificateDataError, certificateRepository } from '../src/modules/certificates/certificate.repository.js';

describe('certificate Supabase repository', () => {
  beforeEach(() => {
    vi.resetAllMocks(); db.from.mockReturnValue(query);
    for (const key of ['select','eq']) query[key]!.mockReturnValue(query);
    query['order']!.mockResolvedValue({ data: [], error: null }); query['maybeSingle']!.mockResolvedValue({ data: null, error: null });
  });
  it('filters ownership in the database query, including nested inner joins', async () => {
    await certificateRepository.owned('7','9');
    expect(query['select']).toHaveBeenCalledWith(expect.stringContaining('resultados_curso!inner(inscripciones!inner(participante_id))'));
    expect(query['eq']).toHaveBeenCalledWith('id','7');
    expect(query['eq']).toHaveBeenCalledWith('resultados_curso.inscripciones.participante_id','9');
  });
  it('uses atomic template emission with the selected template ID', async () => {
    db.rpc.mockResolvedValue({data:{id:'7'},error:null});
    await certificateRepository.issue('12','8F72A91C','https://example.com/verificar/8F72A91C','1','aprobacion','3');
    expect(db.rpc).toHaveBeenCalledWith('emit_certificate_with_template',expect.objectContaining({p_template_id:'3',p_type:'aprobacion',p_actor_id:'1'}));
  });
  it('filters all entries of the private list by owner', async () => {
    await certificateRepository.mine('9');
    expect(query['eq']).toHaveBeenCalledWith('resultados_curso.inscripciones.participante_id','9');
  });
  it('does not request user profiles or internal enrollment relations for public checks', async () => {
    await certificateRepository.verify('8F72A91C');
    expect(query['select']).not.toHaveBeenCalledWith(expect.stringContaining('usuarios'));
    expect(query['select']).not.toHaveBeenCalledWith(expect.stringContaining('inscripciones'));
  });
  it('distinguishes unique-code collisions from a second certificate', () => {
    expect(() => certificateDataError({ code: '23505', message: 'constraint certificados_codigo_verificacion_key' })).toThrow(CertificateCodeCollision);
    try { certificateDataError({ code: '23505', message: 'constraint certificados_resultado_curso_id_key' }); }
    catch (error) { expect(error).toMatchObject({ statusCode: 409 }); }
  });
  it('does not expose unexpected PostgREST details', async () => {
    query['maybeSingle']!.mockResolvedValue({ data: null, error: { code: 'PGRST200', message: 'private SQL details' } });
    await expect(certificateRepository.owned('7','9')).rejects.toMatchObject({ statusCode: 503 });
    await expect(certificateRepository.owned('7','9')).rejects.not.toThrow('private SQL details');
  });
});
