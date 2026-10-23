import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../src/config/prisma.js', () => ({ prisma: { enrollment: { findMany } } }));

import { progressService } from '../src/modules/progress/progress.service.js';

describe('participant progress', () => {
  beforeEach(() => findMany.mockReset());

  const completeEnrollment = () => ({
    id:16,status:'INSCRITO',course:{ id:1,code:'CASE',name:'Curso',startDate:null,endDate:new Date('2020-01-31'),
      minimumPassingScore:70,minimumAttendancePercent:80,
      sessions:[1,2,3,4,5].map(id => ({ id,date:new Date('2020-01-05'),sessionNumber:id,startTime:'18:00',durationMinutes:60 })),
      evaluations:[{ id:1,title:'Examen',maxScore:100,weight:100,
        grades:[{ enrollmentId:16,score:90,comment:null,gradedAt:new Date() }] }]
    },attendance:[1,2,3,4,5].map(id => ({ status:'PRESENT',session:{ id,date:new Date('2020-01-05') } }))
  });

  it('matches the certificate rule for incomplete weights',async () => {
    const row=completeEnrollment(); row.course.evaluations[0]!.weight=20;
    findMany.mockResolvedValue([row]);
    expect((await progressService.listForParticipant(9))[0]).toMatchObject({ finalStatus:null,certificateEligible:false });
  });

  it('matches the certificate rule for four present and one missing attendance mark',async () => {
    const row=completeEnrollment(); row.attendance.pop();
    findMany.mockResolvedValue([row]);
    expect((await progressService.listForParticipant(9))[0]).toMatchObject({
      attendance:{ percentage:80 },finalStatus:null,certificateEligible:false
    });
  });

  it('does not round each evaluation before calculating the final score',async () => {
    const row=completeEnrollment();
    row.course.evaluations=[
      { id:1,title:'Primera',maxScore:3,weight:50,grades:[{ enrollmentId:16,score:2,comment:null,gradedAt:new Date() }] },
      { id:2,title:'Segunda',maxScore:100,weight:50,grades:[{ enrollmentId:16,score:73.32,comment:null,gradedAt:new Date() }] }
    ];
    findMany.mockResolvedValue([row]);
    expect((await progressService.listForParticipant(9))[0]).toMatchObject({ finalGrade:69.99,finalStatus:'REPROBADO',certificateEligible:false });
  });

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
          { id: 1, sessionNumber: 1, startTime: '10:00', durationMinutes: 60, date: new Date('2026-08-05') },
          { id: 2, sessionNumber: 2, startTime: '10:00', durationMinutes: 60, date: new Date('2026-08-12') }
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
        { status: 'PRESENT', session: { id: 1, date: new Date('2026-08-05') } },
        { status: 'ABSENT', session: { id: 2, date: new Date('2026-08-12') } }
      ]
    }]);

    const result = await progressService.listForParticipant(9);

    expect(result[0]).toMatchObject({
      enrollmentStatus: 'INSCRITO',
      attendance: { presentSessions: 1, completedSessions: 2, percentage: 50 },
      currentGrade: 82,
      finalGrade: 82,
      finalStatus: 'NO_CUMPLE_ASISTENCIA', certificateEligible: false,
      requirements: { academicMet: true, attendanceMet: false, minimumAttendancePercent: 80 }
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { participantId: 9, status: {in:["PREINSCRITO","INSCRITO"]} } }));
  });

  it('marks certificate eligibility only when grade and attendance thresholds are met', async () => {
    findMany.mockResolvedValue([{
      id: 12, status: 'INSCRITO', course: {
        id: 4, code: 'HU12', name: 'Curso', startDate: null, endDate: new Date('2026-08-31'), minimumPassingScore: 70,
        sessions: [{ id: 1, sessionNumber: 1, startTime: '10:00', durationMinutes: 60, date: new Date('2026-08-05') }, { id: 2, sessionNumber: 2, startTime: '10:00', durationMinutes: 60, date: new Date('2026-08-12') }, { id: 3, sessionNumber: 3, startTime: '10:00', durationMinutes: 60, date: new Date('2026-08-19') }, { id: 4, sessionNumber: 4, startTime: '10:00', durationMinutes: 60, date: new Date('2026-08-26') }],
        evaluations: [{ id: 1, title: 'Examen', maxScore: 100, weight: 100, grades: [{ enrollmentId: 12, score: 70, comment: null, gradedAt: new Date() }] }]
      },
      attendance: [1, 2, 3, 4].map(id => ({ status: 'PRESENT', session: { id, date: new Date('2026-08-05') } }))
    }]);
    const [progress] = await progressService.listForParticipant(9);
    expect(progress.finalStatus).toBe('APROBADO');
    expect(progress.certificateEligible).toBe(true);
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

  it('keeps the final result pending until every completed session has an attendance record', async () => {
    findMany.mockResolvedValue([{
      id: 12, status: 'INSCRITO', course: {
        id: 4, code: 'HU12', name: 'Curso', startDate: null, endDate: new Date('2020-01-31'), minimumPassingScore: 70,
        sessions: [{ id: 1, sessionNumber: 1, startTime: '10:00', durationMinutes: 60, date: new Date('2020-01-05') }],
        evaluations: [{ id: 1, title: 'Examen', maxScore: 100, weight: 100, grades: [{ enrollmentId: 12, score: 90, comment: null, gradedAt: new Date() }] }]
      }, attendance: []
    }]);
    const [progress] = await progressService.listForParticipant(9);
    expect(progress).toMatchObject({ finalGrade: null, finalStatus: null, requirements: { attendanceMet: null } });
    expect(progress.attendance.sessions[0]?.status).toBeNull();
  });
});
