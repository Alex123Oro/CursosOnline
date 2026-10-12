import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../src/config/prisma.js', () => ({ prisma: { enrollment: { findMany } } }));

import { progressService } from '../src/modules/progress/progress.service.js';

describe('participant progress', () => {
  beforeEach(() => findMany.mockReset());

  it('returns attendance, graded evaluations and final outcome after course completion', async () => {
    findMany.mockResolvedValue([{
      id: 12,
      status: 'INSCRITO',
      createdAt: new Date('2026-09-01'),
      course: {
        id: 4,
        code: 'HU22-01',
        name: 'Curso de progreso',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-31'),
        minimumPassingScore: 70,
        sessions: [
          { id: 1, date: new Date('2026-08-05') },
          { id: 2, date: new Date('2026-08-12') }
        ],
        evaluations: [{
          id: 3,
          title: 'Trabajo final',
          maxScore: 100,
          weight: 100,
          grades: [{ enrollmentId: 12, score: 82, comment: 'Buen trabajo', gradedAt: new Date('2026-08-30') }]
        }]
      },
      attendance: [
        { status: 'PRESENT', session: { date: new Date('2026-08-05') } },
        { status: 'ABSENT', session: { date: new Date('2026-08-12') } }
      ]
    }]);

    const result = await progressService.listForParticipant(9);

    expect(result[0]).toMatchObject({
      enrollmentStatus: 'INSCRITO',
      attendance: { presentSessions: 1, completedSessions: 2, percentage: 50 },
      currentGrade: 82,
      finalGrade: 82,
      finalStatus: 'REPROBADO',
      requirements: { academicMet: true, attendanceMet: false, minimumAttendancePercent: 80 }
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { participantId: 9 } }));
  });

  it('approves only when both grade and attendance thresholds are met', async () => {
    findMany.mockResolvedValue([{
      id: 12, status: 'INSCRITO', course: {
        id: 4, code: 'HU12', name: 'Curso', startDate: null, endDate: new Date('2026-08-31'), minimumPassingScore: 70,
        sessions: [{ id: 1, date: new Date('2026-08-05') }, { id: 2, date: new Date('2026-08-12') }, { id: 3, date: new Date('2026-08-19') }, { id: 4, date: new Date('2026-08-26') }],
        evaluations: [{ id: 1, title: 'Examen', maxScore: 100, weight: 100, grades: [{ enrollmentId: 12, score: 70, comment: null, gradedAt: new Date() }] }]
      },
      attendance: [1, 2, 3, 4].map(() => ({ status: 'PRESENT', session: { date: new Date('2026-08-05') } }))
    }]);
    const [progress] = await progressService.listForParticipant(9);
    expect(progress.finalStatus).toBe('APROBADO');
    expect(progress.requirements).toMatchObject({ academicMet: true, attendanceMet: true });
  });

  it('does not publish a final grade before all evaluations are graded', async () => {
    findMany.mockResolvedValue([{
      id: 12,
      status: 'INSCRITO',
      createdAt: new Date(),
      course: {
        id: 4, code: 'HU22-02', name: 'Curso en progreso', startDate: null, endDate: new Date('2027-01-01'), minimumPassingScore: 70,
        sessions: [],
        evaluations: [{ id: 3, title: 'Examen', maxScore: 100, weight: 100, grades: [] }]
      },
      attendance: []
    }]);

    const [progress] = await progressService.listForParticipant(9);
    expect(progress).toMatchObject({ currentGrade: null, finalGrade: null, finalStatus: null });
  });
});
