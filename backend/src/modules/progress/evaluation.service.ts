import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { RequestUser } from '../../shared/auth.js';
import { HttpError } from '../../shared/http-error.js';

type EvaluationInput = { title: string; maxScore: number; weight: number };
type GradeInput = { score: number; comment?: string | undefined };

const courseForManager = async (courseId: number, user: RequestUser, db: Prisma.TransactionClient = prisma) => {
  if (user.role !== 'ADMIN' && user.role !== 'INSTRUCTOR') {
    throw new HttpError(403, 'Solo administración o el instructor asignado puede gestionar evaluaciones.');
  }
  const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true, instructorId: true, status: true } });
  if (!course) throw new HttpError(404, 'Curso no encontrado.');
  if (user.role === 'INSTRUCTOR') {
    const assigned = course.instructorId === user.id || Boolean(await db.courseInstructor.findUnique({
      where: { courseId_instructorId: { courseId, instructorId: user.id } }, select: { id: true }
    }));
    if (!assigned) throw new HttpError(403, 'No eres instructor asignado a este curso.');
  }
  return course;
};

const formatEvaluation = (evaluation: {
  id: number; title: string; maxScore: Prisma.Decimal; weight: Prisma.Decimal;
}) => ({ id: String(evaluation.id), title: evaluation.title, maxScore: Number(evaluation.maxScore), weight: Number(evaluation.weight) });

const formatGrade = (grade: {
  id: number; evaluationId: number; enrollmentId: number; score: Prisma.Decimal;
  comment: string | null; gradedAt: Date;
}) => ({ id: String(grade.id), evaluationId: String(grade.evaluationId), enrollmentId: String(grade.enrollmentId), score: Number(grade.score), comment: grade.comment, gradedAt: grade.gradedAt.toISOString() });

const translateError = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new HttpError(409, 'Ya existe una evaluación con ese nombre en este curso.');
    if (error.code === 'P2025') throw new HttpError(404, 'Registro no encontrado.');
  }
  throw error;
};

// La transacción serializable evita que dos solicitudes eleven la ponderación por encima de 100.
export const evaluationService = {
  async list(courseId: number, user: RequestUser) {
    await courseForManager(courseId, user);
    const evaluations = await prisma.courseEvaluation.findMany({
      where: { courseId },
      include: { grades: { include: { enrollment: { select: { participant: { select: { name: true } } } } }, orderBy: { gradedAt: 'desc' } } },
      orderBy: { createdAt: 'asc' }
    });
    return evaluations.map(evaluation => ({
      ...formatEvaluation(evaluation),
      grades: evaluation.grades.map(grade => ({
        enrollmentId: String(grade.enrollmentId), participantName: grade.enrollment.participant.name,
        score: Number(grade.score), comment: grade.comment, gradedAt: grade.gradedAt.toISOString()
      }))
    }));
  },
  async create(courseId: number, input: EvaluationInput, user: RequestUser) {
    try {
      return await prisma.$transaction(async tx => {
        await courseForManager(courseId, user, tx);
        const aggregate = await tx.courseEvaluation.aggregate({ where: { courseId }, _sum: { weight: true } });
        if (Number(aggregate._sum.weight ?? 0) + input.weight > 100.000001) {
          throw new HttpError(400, 'La suma de ponderaciones no puede superar el 100 %.');
        }
        const evaluation = await tx.courseEvaluation.create({ data: { courseId, ...input } });
        return { ...formatEvaluation(evaluation), grades: [] };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { return translateError(error); }
  },
  async update(courseId: number, evaluationId: number, input: EvaluationInput, user: RequestUser) {
    try {
      return await prisma.$transaction(async tx => {
        await courseForManager(courseId, user, tx);
        const existing = await tx.courseEvaluation.findFirst({ where: { id: evaluationId, courseId } });
        if (!existing) throw new HttpError(404, 'Evaluación no encontrada en este curso.');
        const grades = await tx.evaluationGrade.findMany({ where: { evaluationId }, select: { score: true } });
        if (grades.some(grade => Number(grade.score) > input.maxScore)) {
          throw new HttpError(409, 'Existen notas mayores al nuevo puntaje máximo.');
        }
        const aggregate = await tx.courseEvaluation.aggregate({ where: { courseId, id: { not: evaluationId } }, _sum: { weight: true } });
        if (Number(aggregate._sum.weight ?? 0) + input.weight > 100.000001) {
          throw new HttpError(400, 'La suma de ponderaciones no puede superar el 100 %.');
        }
        const updated = await tx.courseEvaluation.update({ where: { id: evaluationId }, data: input });
        await tx.courseResult.updateMany({ where: { courseId }, data: { status: 'PENDING', finalScore: null, attendancePercent: null, calculatedAt: null } });
        return formatEvaluation(updated);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { return translateError(error); }
  },
  async remove(courseId: number, evaluationId: number, user: RequestUser) {
    try {
      await prisma.$transaction(async tx => {
        await courseForManager(courseId, user, tx);
        const existing = await tx.courseEvaluation.findFirst({ where: { id: evaluationId, courseId } });
        if (!existing) throw new HttpError(404, 'Evaluación no encontrada en este curso.');
        if (await tx.evaluationGrade.count({ where: { evaluationId } })) {
          throw new HttpError(409, 'No puedes eliminar una evaluación que ya tiene calificaciones.');
        }
        await tx.courseEvaluation.delete({ where: { id: evaluationId } });
        await tx.courseResult.updateMany({ where: { courseId }, data: { status: 'PENDING', finalScore: null, attendancePercent: null, calculatedAt: null } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { translateError(error); }
  },
  async recordGrade(courseId: number, evaluationId: number, enrollmentId: number, input: GradeInput, user: RequestUser) {
    try {
      return await prisma.$transaction(async tx => {
        await courseForManager(courseId, user, tx);
        const evaluation = await tx.courseEvaluation.findFirst({ where: { id: evaluationId, courseId }, select: { id: true, maxScore: true } });
        if (!evaluation) throw new HttpError(404, 'Evaluación no encontrada en este curso.');
        const enrollment = await tx.enrollment.findFirst({ where: { id: enrollmentId, courseId }, select: { status: true } });
        if (!enrollment) throw new HttpError(404, 'Inscripción no encontrada en este curso.');
        if (enrollment.status !== 'INSCRITO') throw new HttpError(400, 'Solo se puede calificar a participantes inscritos.');
        if (input.score > Number(evaluation.maxScore)) throw new HttpError(400, `La nota no puede superar ${evaluation.maxScore}.`);
        const grade = await tx.evaluationGrade.upsert({
          where: { evaluationId_enrollmentId: { evaluationId, enrollmentId } },
          create: { evaluationId, enrollmentId, score: input.score, comment: input.comment?.trim() || null, recordedById: user.id },
          update: { score: input.score, comment: input.comment?.trim() || null, gradedAt: new Date(), recordedById: user.id }
        });
        await tx.courseResult.updateMany({ where: { enrollmentId }, data: { status: 'PENDING', finalScore: null, attendancePercent: null, calculatedAt: null } });
        return formatGrade(grade);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { return translateError(error); }
  }
};
