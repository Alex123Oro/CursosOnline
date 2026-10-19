import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  courseFindUnique: vi.fn(),
  evaluationFindMany: vi.fn(),
  evaluationCreate: vi.fn(),
  evaluationAggregate: vi.fn(),
  evaluationFindFirst: vi.fn(),
  enrollmentFindFirst: vi.fn(),
  assignmentFindUnique: vi.fn(),
  gradeUpsert: vi.fn(),
  resultUpdateMany: vi.fn(),
  transaction: vi.fn()
}));

vi.mock('../src/config/prisma.js', () => {
  const tx = {
    course: { findUnique: mocks.courseFindUnique },
    courseInstructor: { findUnique: mocks.assignmentFindUnique },
    courseEvaluation: { findMany: mocks.evaluationFindMany, aggregate: mocks.evaluationAggregate, create: mocks.evaluationCreate, findFirst: mocks.evaluationFindFirst },
    enrollment: { findFirst: mocks.enrollmentFindFirst },
    evaluationGrade: { upsert: mocks.gradeUpsert },
    courseResult: { updateMany: mocks.resultUpdateMany }
  };
  return { prisma: { ...tx, $transaction: mocks.transaction } };
});

import { evaluationService } from '../src/modules/progress/evaluation.service.js';

const instructor = { id: 8, name: 'Carla', email: 'carla@example.test', role: 'INSTRUCTOR' as const, participantTypeId: null };

describe('evaluation management', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.courseFindUnique.mockResolvedValue({ id: 4, instructorId: 8 });
    mocks.evaluationAggregate.mockResolvedValue({ _sum: { weight: 0 } });
    mocks.transaction.mockImplementation((work: (tx: unknown) => unknown) => work({
      course: { findUnique: mocks.courseFindUnique },
      courseInstructor: { findUnique: mocks.assignmentFindUnique },
      courseEvaluation: { findMany: mocks.evaluationFindMany, aggregate: mocks.evaluationAggregate, create: mocks.evaluationCreate, findFirst: mocks.evaluationFindFirst },
      enrollment: { findFirst: mocks.enrollmentFindFirst },
      evaluationGrade: { upsert: mocks.gradeUpsert },
      courseResult: { updateMany: mocks.resultUpdateMany }
    }));
  });

  it('rejects a new evaluation when total weight would exceed 100 percent', async () => {
    mocks.evaluationAggregate.mockResolvedValue({ _sum: { weight: 80 } });
    await expect(evaluationService.create(4, { title: 'Final', maxScore: 100, weight: 30 }, instructor)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.evaluationCreate).not.toHaveBeenCalled();
  });

  it('creates an evaluation for the assigned instructor course', async () => {
    mocks.evaluationCreate.mockResolvedValue({ id: 3, title: 'Examen', maxScore: 100, weight: 40 });

    await expect(evaluationService.create(4, { title: 'Examen', maxScore: 100, weight: 40 }, instructor)).resolves.toMatchObject({
      id: '3', title: 'Examen', maxScore: 100, weight: 40
    });
  });

  it('rejects a score above the evaluation maximum', async () => {
    mocks.evaluationFindFirst.mockResolvedValue({ id: 3, maxScore: 20 });
    mocks.enrollmentFindFirst.mockResolvedValue({ id: 12, courseId: 4, status: 'INSCRITO' });

    await expect(evaluationService.recordGrade(4, 3, 12, { score: 21 }, instructor)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.gradeUpsert).not.toHaveBeenCalled();
  });

  it('prevents an instructor from grading an unassigned course', async () => {
    mocks.courseFindUnique.mockResolvedValue({ id: 4, instructorId: 9 });

    await expect(evaluationService.create(4, { title: 'Examen', maxScore: 100, weight: 40 }, instructor)).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.evaluationCreate).not.toHaveBeenCalled();
  });
});
