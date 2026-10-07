import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { boliviaToday } from '../src/modules/attendance/attendance.rules.js';
const prisma = new PrismaClient();
const run = async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Este seed solo admite una base local.');
  const instructor = await prisma.user.findFirst({ where: { role: 'INSTRUCTOR', name: 'Ing. Carla Mendoza' } });
  const type = await prisma.participantType.findFirst({ orderBy: { id: 'asc' } });
  if (!instructor || !type) throw new Error('Carga primero los instructores y tipos de participante.');
  const today = new Date(boliviaToday());
  const dateAt = (offset: number) => new Date(today.getTime() + offset * 86400000);
  const course = await prisma.course.upsert({ where: { code: 'EVA-HU10-DEMO' }, update: {}, create: {
    code: 'EVA-HU10-DEMO', name: 'Prueba HU-10 · Instructor', instructor: instructor.name, instructorId: instructor.id,
    content: 'Curso local de demostración del control administrativo de asistencia.', durationHours: 10,
    schedule: 'Clases de prueba · 17:00–18:00', status: 'PUBLISHED', startDate: dateAt(-8), endDate: dateAt(1),
    capacity: 20, preinscriptionStart: dateAt(-15), preinscriptionEnd: dateAt(1)
  } });
  await prisma.coursePrice.upsert({ where: { courseId_participantTypeId: { courseId: course.id, participantTypeId: type.id } }, update: {}, create: { courseId: course.id, participantTypeId: type.id, basePrice: 0 } });
  for (let offset = -8; offset <= 1; offset++) await prisma.courseSession.upsert({ where: { courseId_date_startTime: { courseId: course.id, date: dateAt(offset), startTime: '17:00' } }, update: {}, create: { courseId: course.id, date: dateAt(offset), startTime: '17:00', durationMinutes: 60 } });
  console.log(`Curso local HU-10: ${course.id}. Instructor: ${instructor.name}. 10 sesiones; los registros existentes se conservan.`);
};
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
