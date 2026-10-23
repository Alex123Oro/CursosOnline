import { ParamMap, Params } from '@angular/router';
import { EnrollmentQuery } from '../../core/enrollment.service';
import { EnrollmentStatus } from '../../core/course.service';
const statuses: Record<string, EnrollmentStatus> = { inscritos: 'INSCRITO', cancelados: 'CANCELADO', rechazados: 'RECHAZADO', caducados: 'CADUCADO' };
export function readEnrollmentQuery(params: ParamMap): EnrollmentQuery {
  const course = params.get('curso') ?? '';
  const page = Number(params.get('pagina'));
  return {
    courseId: /^[1-9]\d*$/.test(course) && Number.isSafeInteger(Number(course)) ? course : '',
    status: statuses[params.get('estado') ?? ''] ?? 'PREINSCRITO',
    search: (params.get('buscar') ?? '').trim().slice(0, 100),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}
export function enrollmentParams(query: EnrollmentQuery): Params {
  return {
    curso: query.courseId || null,
    estado: ({ INSCRITO: 'inscritos', PREINSCRITO: 'preinscritos', CANCELADO: 'cancelados', RECHAZADO: 'rechazados', CADUCADO: 'caducados' })[query.status],
    buscar: query.search || null,
    pagina: query.page,
  };
}
