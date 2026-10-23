import { beforeEach, describe, expect, it, vi } from 'vitest';
const db=vi.hoisted(() => ({ courseResult: { updateMany: vi.fn() }, $transaction:vi.fn(),$queryRaw:vi.fn(),user:{findUnique:vi.fn()},
  course:{ findUnique:vi.fn(),create:vi.fn(),update:vi.fn() } }));
vi.mock('../src/config/prisma.js',() => ({ prisma:db }));
import { courseService } from '../src/modules/courses/course.service.js';
import { courseInputSchema } from '../src/modules/courses/course.rules.js';

const input=courseInputSchema.parse({ name:'Curso preparado',content:'Contenido del curso preparado',durationHours:10,
  instructor:'Docente',schedule:'Lunes 18:00',approvalCriteria:'Nota y asistencia',capacity:20,
  startDate:'2026-11-01',endDate:'2026-11-30',preinscriptionStart:'2026-10-01',preinscriptionEnd:'2026-10-31' });
const ready={ ...input,id:7,code:'CURSO',status:'DRAFT',instructorId:8,minimumEnrollment:1,
  startDate:new Date(input.startDate!),endDate:new Date(input.endDate!),
  preinscriptionStart:new Date(input.preinscriptionStart!),preinscriptionEnd:new Date(input.preinscriptionEnd!),
  sessions:[{ date:new Date('2026-11-02'),startTime:'18:00',durationMinutes:60 }],
  prices:[{ participantTypeId:1,participantType:{ name:'Estudiante' },basePrice:100 }],
  enrollments:[],_count:{ enrollments:0 },createdAt:new Date(),updatedAt:new Date() };

describe('publication cannot be bypassed by other course writes',() => {
  beforeEach(() => {
    vi.resetAllMocks(); db.user.findUnique.mockResolvedValue({id:8,role:"INSTRUCTOR"}); db.$queryRaw.mockResolvedValue([]);
    db.$transaction.mockImplementation(callback => callback(db));
    db.course.findUnique.mockResolvedValue(ready);
    db.course.update.mockResolvedValue({ ...ready,status:'PUBLISHED' });
  });
  it('refuses direct creation as published even with otherwise valid fields',async () => {
    await expect(courseService.create({ ...input,status:'PUBLISHED' })).rejects.toMatchObject({ statusCode:400 });
    expect(db.course.create).not.toHaveBeenCalled();
  });
  it('refuses publishing through the generic update',async () => {
    await expect(courseService.update(7,{ ...input,status:'PUBLISHED' })).rejects.toMatchObject({ statusCode:400 });
    expect(db.course.update).not.toHaveBeenCalled();
  });
  it.each(['prices','sessions'])('requires real %s on publication',async field => {
    db.course.findUnique.mockResolvedValue({ ...ready,[field]:[] });
    await expect(courseService.publish(7)).rejects.toMatchObject({ statusCode:400 });
    expect(db.course.update).not.toHaveBeenCalled();
  });
  it('publishes a prepared draft through the dedicated operation',async () => {
    await expect(courseService.publish(7)).resolves.toMatchObject({ status:'PUBLISHED' });
  });
  it.each(['capacity','preinscriptionStart','preinscriptionEnd'])('preserves published requirement %s during edits',async field => {
    db.course.findUnique.mockResolvedValue({ ...ready,status:'PUBLISHED' });
    await expect(courseService.update(7,{ ...input,[field]:null })).rejects.toMatchObject({ statusCode:400 });
    expect(db.course.update).not.toHaveBeenCalled();
  });
  it('refuses reducing capacity below the number of reserved places',async () => {
    db.course.findUnique.mockResolvedValue({ ...ready,_count:{ enrollments:10 } });
    await expect(courseService.update(7,{ ...input,capacity:5 })).rejects.toMatchObject({ statusCode:409 });
  });
});
