import { prisma } from '../../config/prisma.js';
import type { RequestUser } from '../../shared/auth.js';
import { HttpError } from '../../shared/http-error.js';

const courseForManager = async (courseId: number, user: RequestUser) => {
  if (user.role !== 'ADMIN' && user.role !== 'INSTRUCTOR') {
    throw new HttpError(403, 'Solo administración o el instructor asignado puede gestionar evaluaciones.');
  }
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, instructorId: true } });
  if (!course) throw new HttpError(404, 'Curso no encontrado.');
  if (user.role === 'INSTRUCTOR' && course.instructorId !== user.id) {
    throw new HttpError(403, 'No eres el instructor asignado a este curso.');
  }
  return course;
};

export const evaluationService = {
  async list(courseId: number, user: RequestUser) {
    await courseForManager(courseId, user);
    const evaluations = await prisma.courseEvaluation.findMany({
      where: { courseId },
      include: {
        grades: {
          include: { enrollment: { select: { participant: { select: { name: true } } } } },
          orderBy: { gradedAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
    return evaluations.map(evaluation => ({
      id: String(evaluation.id),
      title: evaluation.title,
      maxScore: Number(evaluation.maxScore),
      weight: Number(evaluation.weight),
      grades: evaluation.grades.map(grade => ({
        enrollmentId: String(grade.enrollmentId),
        participantName: grade.enrollment.participant.name,
        score: Number(grade.score),
        comment: grade.comment,
        gradedAt: grade.gradedAt.toISOString()
      }))
    }));
  },

  async create(courseId: number, input: { title: string; maxScore: number; weight: number }, user: RequestUser) {
    await courseForManager(courseId, user);
    const existing = await prisma.courseEvaluation.aggregate({ where: { courseId }, _sum: { weight: true } });
    if (Number(existing._sum.weight ?? 0) + input.weight > 100) {
      throw new HttpError(400, 'La suma de ponderaciones de las evaluaciones no puede superar el 100 %.');
    }
    const evaluation = await prisma.courseEvaluation.create({ data: { courseId, ...input } });
    return { id: String(evaluation.id), title: evaluation.title, maxScore: Number(evaluation.maxScore), weight: Number(evaluation.weight), grades: [] };
  },

  async recordGrade(courseId: number, evaluationId: number, enrollmentId: number, input: { score: number; comment?: string | undefined }, user: RequestUser) {
    await courseForManager(courseId, user);
    const evaluation = await prisma.courseEvaluation.findFirst({
      where: { id: evaluationId, courseId },
      select: { id: true, maxScore: true }
    });
    if (!evaluation) throw new HttpError(404, 'Evaluación no encontrada en este curso.');

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, courseId: true, status: true }
    });
    if (!enrollment || enrollment.courseId !== courseId) throw new HttpError(404, 'Inscripción no encontrada en este curso.');
    if (enrollment.status !== 'INSCRITO') throw new HttpError(400, 'Solo se puede calificar a participantes inscritos.');

    const maxScore = Number(evaluation.maxScore);
    if (input.score > maxScore) throw new HttpError(400, `La nota no puede superar ${maxScore}.`);

    const grade = await prisma.evaluationGrade.upsert({
      where: { evaluationId_enrollmentId: { evaluationId, enrollmentId } },
      create: { evaluationId, enrollmentId, score: input.score, comment: input.comment?.trim() || null },
      update: { score: input.score, comment: input.comment?.trim() || null, gradedAt: new Date() }
    });
    return { id: String(grade.id), evaluationId: String(evaluationId), enrollmentId: String(enrollmentId), score: Number(grade.score), comment: grade.comment, gradedAt: grade.gradedAt.toISOString() };
  }
};
