import { Prisma } from '@prisma/client';

import { randomUUID } from 'node:crypto';

import { prisma } from '../../config/prisma.js';

import { HttpError } from '../../shared/http-error.js';

import { canPublishCourse, type CourseInput } from './course.rules.js';

import { summarizeSessions } from '../course-sessions/course-session.rules.js';



const courseSelect = {

  id: true,

  code: true,

  name: true,

  content: true,

  coverUrl: true,

  durationHours: true,

  instructor: true,

  instructorId: true,

  schedule: true,

  sessions: { select: { date: true, startTime: true, durationMinutes: true } },

  approvalCriteria: true,

  status: true,

  startDate: true,

  endDate: true,

  capacity: true,

  minimumEnrollment: true,

  preinscriptionStart: true,

  preinscriptionEnd: true,

  prices: { select: { participantTypeId: true, basePrice: true, participantType: { select: { name: true } } } },

  _count: { select: { enrollments: true } },

  enrollments: { where: { status: 'INSCRITO' }, select: { status: true } },

  createdAt: true,

  updatedAt: true

} satisfies Prisma.CourseSelect;



type CourseRecord = Prisma.CourseGetPayload<{ select: typeof courseSelect }>;

const assertPublicationReady = (course: CourseRecord, input?: CourseInput) => {
  canPublishCourse({
    instructor: input?.instructor ?? course.instructor,
    schedule: course.sessions.length ? summarizeSessions(course.sessions) : input?.schedule ?? course.schedule,
    startDate: input ? input.startDate ?? null : course.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: input ? input.endDate ?? null : course.endDate?.toISOString().slice(0, 10) ?? null,
    capacity: input ? input.capacity : course.capacity,
    preinscriptionStart: input ? input.preinscriptionStart ?? null : course.preinscriptionStart?.toISOString().slice(0, 10) ?? null,
    preinscriptionEnd: input ? input.preinscriptionEnd ?? null : course.preinscriptionEnd?.toISOString().slice(0, 10) ?? null
  });
  if (!course.sessions.length) throw new HttpError(400, 'Programa al menos una clase antes de publicar el curso.');
  if (!course.prices.length) throw new HttpError(400, 'Configura al menos un precio por categoría antes de publicar el curso.');
};


// The connected Supabase schema stores sessions in `sesiones`; older Prisma

// installations use `sesiones_curso`. Read either without duplicating data.

async function readCatalogCourses(where: Prisma.CourseWhereInput) {

  const { sessions: _sessions, ...select } = courseSelect;

  const courses = await prisma.course.findMany({ where, select, orderBy: { createdAt: 'desc' } });

  if (!courses.length) return [];

  const [tables] = await prisma.$queryRaw<{ modern: string | null; legacy: string | null }[]>`

    SELECT to_regclass('public.sesiones_curso')::text AS modern,

           to_regclass('public.sesiones')::text AS legacy`;

  if (!tables?.modern && !tables?.legacy) {

    throw new HttpError(503, 'No se encuentra la tabla de sesiones del catálogo.');

  }

  const table = tables.legacy ? Prisma.sql`public.sesiones` : Prisma.sql`public.sesiones_curso`;

  const sessions = await prisma.$queryRaw<{

    courseId: number; date: Date; startTime: string; durationMinutes: number;

  }[]>(Prisma.sql`

    SELECT curso_id::integer AS "courseId", fecha AS date,

           left(hora_inicio::text, 5) AS "startTime", duracion_minutos AS "durationMinutes"

    FROM ${table} WHERE curso_id IN (${Prisma.join(courses.map(course => course.id))})

    ORDER BY fecha, hora_inicio`);

  return courses.map(course => toCourseResponse({

    ...course, sessions: sessions.filter(session => session.courseId === course.id)

  }));

}



const toCourseResponse = (course: CourseRecord) => ({

  id: String(course.id),

  code: course.code ?? '',

  name: course.name,

  content: course.content ?? '',

  coverUrl: course.coverUrl ?? null,

  durationHours: course.durationHours ?? 0,

  instructor: course.instructor ?? '',

  instructorId: course.instructorId == null ? null : String(course.instructorId),

  schedule: course.sessions?.length ? summarizeSessions(course.sessions) : course.schedule ?? '',

  approvalCriteria: course.approvalCriteria ?? '',

  status: course.status ?? 'DRAFT',

  startDate: course.startDate ? course.startDate.toISOString().slice(0, 10) : null,

  endDate: course.endDate ? course.endDate.toISOString().slice(0, 10) : null,

  capacity: course.capacity,

  minimumEnrollment: course.minimumEnrollment,

  occupiedSlots: course._count.enrollments,

  enrolledCount: course.enrollments?.length ?? 0,

  remainingSlots: course.capacity === null ? null : Math.max(0, course.capacity - course._count.enrollments),

  preinscriptionStart: course.preinscriptionStart ? course.preinscriptionStart.toISOString().slice(0, 10) : null,

  preinscriptionEnd: course.preinscriptionEnd ? course.preinscriptionEnd.toISOString().slice(0, 10) : null,

  prices: course.prices.map(price => ({ participantTypeId: String(price.participantTypeId), participantTypeName: price.participantType.name, basePrice: Number(price.basePrice) })),

  enrollment: null,

  createdAt: course.createdAt.toISOString(),

  updatedAt: course.updatedAt.toISOString()

});



const toCourseData = (input: CourseInput): Prisma.CourseUncheckedCreateInput => {

  const { code, instructorId, status, minimumEnrollment, schedule, coverUrl, ...fields } = input;

  return {

  ...fields,

  ...(coverUrl === undefined ? {} : { coverUrl: coverUrl || null }),

  ...(schedule === undefined ? {} : { schedule }),

  ...(minimumEnrollment === undefined ? {} : { minimumEnrollment }),

  ...(instructorId === undefined ? {} : { instructorId }),

  approvalCriteria: input.approvalCriteria ?? null,

  preinscriptionStart: input.preinscriptionStart ? new Date(input.preinscriptionStart) : null,

  preinscriptionEnd: input.preinscriptionEnd ? new Date(input.preinscriptionEnd) : null,

  ...(status === 'DRAFT' || status === 'PUBLISHED' ? { status } : {}),

  startDate: input.startDate ? new Date(input.startDate) : null,

  endDate: input.endDate ? new Date(input.endDate) : null

  };

};



const handlePrismaError = (error: unknown): never => {

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {

    throw new HttpError(409, 'Ya existe un curso con ese codigo.', [

      { path: 'code', message: 'El codigo ya esta registrado.' }

    ]);

  }



  throw error;

};



export const courseService = {
  /** Lista los cursos asignados a un instructor, incluyendo asignaciones anteriores. */
  async listByInstructor(instructorId: number) {
    const instructor = await prisma.user.findUnique({
      where: { id: instructorId }, select: { id: true, role: true }
    });
    if (!instructor || instructor.role !== 'INSTRUCTOR') {
      throw new HttpError(404, 'Instructor no encontrado.');
    }
    const courses = await prisma.course.findMany({
      where: { OR: [
        { instructorId },
        { instructorAssignments: { some: { instructorId } } }
      ] },
      select: courseSelect, orderBy: { createdAt: 'desc' }
    });
    return courses.map(toCourseResponse);
  },


  async replacePrices(id: number, items: { participantTypeId: number; basePrice: number }[]) {

    const course = await prisma.course.findUnique({ where: { id }, select: { id: true } });

    if (!course) throw new HttpError(404, 'Curso no encontrado.');

    const typeIds = items.map(item => item.participantTypeId);

    const types = await prisma.participantType.findMany({ where: { id: { in: typeIds } }, select: { id: true } });

    if (types.length !== new Set(typeIds).size || typeIds.length !== new Set(typeIds).size) throw new HttpError(400, 'Una o más categorías no existen o están duplicadas.');

    await prisma.$transaction([

      prisma.coursePrice.deleteMany({ where: { courseId: id } }),

      prisma.coursePrice.createMany({ data: items.map(item => ({ courseId: id, ...item })) })

    ]);

    const updated = await prisma.course.findUnique({ where: { id }, select: courseSelect });

    if (!updated) throw new HttpError(404, 'Curso no encontrado.');

    return toCourseResponse(updated);

  },

  /**

   * Lista todos los cursos para el panel administrativo.

   */

  async list() {

    const courses = await prisma.course.findMany({

      select: courseSelect,

      orderBy: { createdAt: 'desc' }

    });



    return courses.map(toCourseResponse);

  },



  /**

   * Devuelve solo los cursos publicados para el catálogo público.

   */

  async catalog() {

    return readCatalogCourses({ status: 'PUBLISHED' });

  },



  async catalogById(id: number, participantId?: number) {

    const [response] = await readCatalogCourses({ id, status: 'PUBLISHED' });

    if (!response) return null;

    if (!participantId) return response;

    const enrollment = await prisma.enrollment.findUnique({

      where: { courseId_participantId: { courseId: id, participantId } },

      select: { status: true, scholarshipPercent: true, scholarshipActive: true, benefitAmount: true, finalAmount: true, confirmedAt: true }

    });

    return { ...response, enrollment: enrollment ? {

      status: enrollment.status,

      scholarshipPercent: enrollment.scholarshipActive ? Number(enrollment.scholarshipPercent) : 0,

      benefitAmount: Number(enrollment.benefitAmount), finalAmount: Number(enrollment.finalAmount),

      confirmedAt: enrollment.confirmedAt?.toISOString() ?? null

    } : null };

  },



  /**

   * Crea un curso nuevo en estado borrador.

   */

  async create(input: CourseInput) {

    try {
      if (input.status === 'PUBLISHED') {
        throw new HttpError(400, 'El curso debe crearse en borrador. Completa su preparación y utiliza la acción Publicar.');
      }

      const selectedInstructor = input.instructorId ? await prisma.user.findUnique({

        where: { id: input.instructorId },

        select: { id: true, name: true, role: true }

      }) : null;

      if (input.instructorId && (!selectedInstructor || selectedInstructor.role !== 'INSTRUCTOR')) {

        throw new HttpError(400, 'El usuario seleccionado no es un instructor valido.');

      }

      const data = toCourseData(input);

      const words = input.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().match(/[A-Z0-9]+/g) ?? [];

      const initials = words.filter(word => !['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'EN', 'PARA', 'A', 'AL'].includes(word))

        .map(word => word[0]).join('').slice(0, 8) || 'CUR';

      const date = input.startDate?.slice(0, 10) || new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/La_Paz' }).format(new Date());

      const generatedCode = `${initials}-${date.replace(/-/g, '')}`;

      if (selectedInstructor) {

        data.instructorId = selectedInstructor.id;

        data.instructor = selectedInstructor.name;

      }

      for (let attempt = 0; attempt < 5; attempt++) {

        const code = attempt === 0 ? generatedCode : `${generatedCode}-${randomUUID().slice(0, 8).toUpperCase()}`;

        try {

          const course = await prisma.course.create({ data: { ...data, code }, select: courseSelect });

          return toCourseResponse(course);

        } catch (error) {

          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002'

            || !/code|codigo/i.test(String(error.meta?.['target'])) || attempt === 4) throw error;

        }

      }

      throw new HttpError(409, 'No se pudo generar un código único. Inténtalo de nuevo.');

    } catch (error) {

      handlePrismaError(error);

    }

  },



  /**

   * Actualiza la información del curso.

   */

  async update(id: number, input: CourseInput) {

    try {
      return await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM cursos WHERE id = ${id} FOR UPDATE`;
        const existing = await tx.course.findUnique({

          where: { id },

          select: courseSelect

        });

        if (!existing) throw new HttpError(404, 'Curso no encontrado.');
        if (input.status !== undefined && input.status !== existing.status) {
          throw new HttpError(400, 'Utiliza las acciones Publicar o Volver a borrador para cambiar el estado del curso.');
        }

        if (input.capacity != null && (input.minimumEnrollment ?? existing.minimumEnrollment ?? 1) > input.capacity) {

          throw new HttpError(400, 'El mínimo de inscritos no puede superar la capacidad del curso.');

        }

        if (existing.status === 'PUBLISHED' && (!input.startDate || !input.endDate)) {

          throw new HttpError(400, 'Un curso publicado debe conservar sus fechas de inicio y fin.');

        }
        if (existing.status === 'PUBLISHED') assertPublicationReady(existing, input);
        if (input.capacity != null && input.capacity < existing._count.enrollments) {
          throw new HttpError(409, 'La capacidad no puede ser menor al número de plazas ya reservadas.');
        }

        const data = toCourseData(input);

        if (input.instructorId === undefined && existing.instructorId != null) {

          const assignedInstructor = await tx.user.findUnique({

            where: { id: existing.instructorId },

            select: { id: true, name: true, role: true }

          });

          if (assignedInstructor?.role === 'INSTRUCTOR') {

            data.instructorId = assignedInstructor.id;

            data.instructor = assignedInstructor.name;

          } else {

            data.instructorId = existing.instructorId;

          }

        } else if (input.instructorId) {

          const selectedInstructor = await tx.user.findUnique({

            where: { id: input.instructorId },

            select: { id: true, name: true, role: true }

          });

          if (!selectedInstructor || selectedInstructor.role !== 'INSTRUCTOR') {

            throw new HttpError(400, 'El usuario seleccionado no es un instructor valido.');

          }

          data.instructorId = selectedInstructor.id;

          data.instructor = selectedInstructor.name;

        }

        const course = await tx.course.update({

          where: { id },

          data,

          select: courseSelect

        });



        return toCourseResponse(course);
      });

    } catch (error) {

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {

        throw new HttpError(404, 'Curso no encontrado.');

      }



      handlePrismaError(error);

    }

  },



  /**

   * Devuelve el curso a borrador conservando sus datos y relaciones.

   */

  async unpublish(id: number) {

    try {

      const course = await prisma.course.update({ where: { id }, data: { status: 'DRAFT' }, select: courseSelect });

      return toCourseResponse(course);

    } catch (error) {

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {

        throw new HttpError(404, 'Curso no encontrado.');

      }

      throw error;

    }

  },



  /** Publica un curso solo si cumple con la información mínima requerida. */

  async publish(id: number) {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM cursos WHERE id = ${id} FOR UPDATE`;
      const existing = await tx.course.findUnique({

        where: { id },

        select: courseSelect

      });



      if (!existing) {

        throw new HttpError(404, 'Curso no encontrado.');

      }



      assertPublicationReady(existing);



      try {

        const course = await tx.course.update({

          where: { id },

          data: { status: 'PUBLISHED' },

          select: courseSelect

        });



        return toCourseResponse(course);

      } catch (error) {

        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {

          throw new HttpError(404, 'Curso no encontrado.');

        }



        throw error;

      }
    });

  }

};
