import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { SEED_COURSES } from './seed-data.js';

const prisma = new PrismaClient();

const seed = async () => {
  for (const course of SEED_COURSES) {
    const data = {
      ...course,
      startDate: new Date(course.startDate),
      endDate: new Date(course.endDate)
    };

    await prisma.course.upsert({
      where: { code: course.code },
      create: data,
      update: data
    });
  }

  console.log(`${SEED_COURSES.length} cursos publicados fueron creados o actualizados.`);
};

seed()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
