import { prisma } from '../../config/prisma.js';
import { boliviaToday } from '../attendance/attendance.rules.js';

const dateOnly = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const round = (value: number) => Math.round(value * 100) / 100;

export const progressService = {
  async listForParticipant(participantId: number) {
    const enrollments = await prisma.enrollment.findMany({
      where: { participantId },
      include: {
        course: {
          select: {
            id: true,
            code: true,
            name: true,
            startDate: true,
            endDate: true,
            minimumPassingScore: true,
            sessions: { select: { id: true, date: true }, orderBy: { date: 'asc' } },
            evaluations: {
              select: {
                id: true,
                title: true,
                maxScore: true,
                weight: true,
                grades: { select: { enrollmentId: true, score: true, comment: true, gradedAt: true } }
              },
              orderBy: { createdAt: 'asc' }
            }
          }
        },
        attendance: { select: { status: true, session: { select: { date: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const today = boliviaToday();
    return enrollments.map(enrollment => {
      const completedSessions = enrollment.course.sessions.filter(session => dateOnly(session.date)! <= today);
      const presentSessions = enrollment.attendance.filter(attendance =>
        attendance.status === 'PRESENT' && dateOnly(attendance.session.date)! <= today
      ).length;
      const attendancePercent = completedSessions.length
        ? round((presentSessions / completedSessions.length) * 100)
        : null;

      const evaluations = enrollment.course.evaluations.map(evaluation => {
        const grade = evaluation.grades.find(item => item.enrollmentId === enrollment.id);
        const score = grade ? Number(grade.score) : null;
        const maxScore = Number(evaluation.maxScore);
        const weight = Number(evaluation.weight);
        return {
          id: String(evaluation.id),
          title: evaluation.title,
          score,
          maxScore,
          weight,
          comment: grade?.comment ?? null,
          gradedAt: grade?.gradedAt.toISOString() ?? null,
          percentage: score === null ? null : round((score / maxScore) * 100)
        };
      });

      const gradedEvaluations = evaluations.filter(evaluation => evaluation.score !== null);
      const weightTotal = gradedEvaluations.reduce((sum, evaluation) => sum + evaluation.weight, 0);
      const currentGrade = weightTotal
        ? round(gradedEvaluations.reduce((sum, evaluation) => sum + (evaluation.percentage ?? 0) * evaluation.weight, 0) / weightTotal)
        : null;
      const courseEnd = dateOnly(enrollment.course.endDate);
      const isFinished = Boolean(courseEnd && courseEnd < today);
      const allEvaluationsGraded = evaluations.length > 0 && gradedEvaluations.length === evaluations.length;
      const finalGrade = isFinished && allEvaluationsGraded ? currentGrade : null;
      const minimumPassingScore = Number(enrollment.course.minimumPassingScore);

      return {
        enrollmentId: String(enrollment.id),
        enrollmentStatus: enrollment.status,
        course: {
          id: String(enrollment.course.id),
          code: enrollment.course.code ?? '',
          name: enrollment.course.name,
          startDate: dateOnly(enrollment.course.startDate),
          endDate: courseEnd
        },
        attendance: { presentSessions, completedSessions: completedSessions.length, percentage: attendancePercent },
        evaluations,
        currentGrade,
        finalGrade,
        minimumPassingScore,
        requirements: {
          academicMet: finalGrade === null ? null : finalGrade >= minimumPassingScore,
          attendanceMet: attendancePercent === null ? null : attendancePercent >= 80,
          minimumAttendancePercent: 80
        },
        finalStatus: finalGrade === null || attendancePercent === null
          ? null
          : finalGrade >= minimumPassingScore && attendancePercent >= 80 ? 'APROBADO' : 'REPROBADO'
      };
    });
  }
};
