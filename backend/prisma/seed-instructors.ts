import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { SEED_INSTRUCTORS } from './seed-data.js';

// Incremental seed for an existing local database: no course, price or enrollment is replaced.
const prisma = new PrismaClient();
try {
  for (const instructor of SEED_INSTRUCTORS) {
    const user = await prisma.user.upsert({
      where: { email: instructor.email },
      create: { ...instructor, authId: randomUUID(), role: 'INSTRUCTOR' },
      update: { name: instructor.name, role: 'INSTRUCTOR' }
    });
    await prisma.course.updateMany({ where: { instructor: instructor.name, instructorId: null }, data: { instructorId: user.id } });
  }
  console.log('Instructores de prueba cargados; cursos existentes conservados.');
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
