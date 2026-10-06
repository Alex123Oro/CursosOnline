import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { boliviaToday } from '../src/modules/attendance/attendance.rules.js';

const prisma = new PrismaClient();
const run = async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Este seed de prueba solo admite una base local.');
  const instructor = await prisma.user.findFirst({ where: { role: 'INSTRUCTOR', name: 'Ing. Carla Mendoza' } });
  const type = await prisma.participantType.findFirst({ orderBy: { id: 'asc' } });
  if (!instructor || !type) throw new Error('Carga primero los instructores y tipos de participante.');
  const today = new Date(boliviaToday());
  const dateAt = (offset: number) => new Date(today.getTime() + offset * 86400000);
  const course = await prisma.course.upsert({ where: { code: 'EVA-HU09-DEMO' }, update: {}, create: {
    code: 'EVA-HU09-DEMO', name: 'Prueba HU-09 · Asistencia', instructor: instructor.name, instructorId: instructor.id,
    content: 'Curso local de prueba para registrar y corregir asistencia.', durationHours: 7, schedule: 'Clases de prueba · 15:00–16:00', approvalCriteria: 'Datos de ejemplo para HU-09.',
    status: 'PUBLISHED', startDate: dateAt(-5), endDate: dateAt(1), capacity: 20, preinscriptionStart: dateAt(-10), preinscriptionEnd: dateAt(1)
  } });
  await prisma.coursePrice.upsert({ where: { courseId_participantTypeId: { courseId: course.id, participantTypeId: type.id } }, update: {}, create: { courseId: course.id, participantTypeId: type.id, basePrice: 0 } });
  const sessions = [];
  for (let offset = -5; offset <= 1; offset++) sessions.push(await prisma.courseSession.upsert({ where: { courseId_date_startTime: { courseId: course.id, date: dateAt(offset), startTime: '15:00' } }, update: {}, create: { courseId: course.id, date: dateAt(offset), startTime: '15:00', durationMinutes: 60 } }));
  const names = ['Ana Álvarez', 'Bruno Barrientos', 'Camila Castro', 'Daniel Díaz', 'Elena Espinoza', 'Felipe Flores', 'Gabriela Gómez', 'Hugo Herrera', 'Inés Ibáñez', 'Jorge Jiménez'];
  for (const [index, name] of names.entries()) {
    const participant = await prisma.user.upsert({ where: { email: `hu09.alumno${index + 1}@eva.local` }, update: {}, create: { name, email: `hu09.alumno${index + 1}@eva.local`, authId: randomUUID(), role: 'PARTICIPANT', participantTypeId: type.id } });
    const enrollment = await prisma.enrollment.upsert({ where: { courseId_participantId: { courseId: course.id, participantId: participant.id } }, update: {}, create: { courseId: course.id, participantId: participant.id, participantTypeId: type.id, status: index === 9 ? 'PREINSCRITO' : 'INSCRITO', basePrice: 0, finalAmount: 0 } });
    if (index === 0) for (let i = 0; i < 4; i++) await prisma.attendance.upsert({ where: { sessionId_enrollmentId: { sessionId: sessions[i].id, enrollmentId: enrollment.id } }, update: {}, create: { courseId: course.id, sessionId: sessions[i].id, enrollmentId: enrollment.id, status: i === 3 ? 'ABSENT' : 'PRESENT', recordedById: instructor.id } });
  }
  console.log(`Curso local HU-09: ${course.id}. Instructor: ${instructor.name}. 9 inscritos y 1 preinscrito; las marcas existentes se conservan.`);
};
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
