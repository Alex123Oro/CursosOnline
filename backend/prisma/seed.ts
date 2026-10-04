import 'dotenv/config';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { SEED_COURSES, SEED_PARTICIPANT_TYPES, SEED_PRICES, SEED_USERS } from './seed-data.js';

const prisma = new PrismaClient();

const seed = async () => {
  const types = [];

  for (const name of SEED_PARTICIPANT_TYPES) {
    const type = await prisma.participantType.upsert({
      where: { name },
      create: { name },
      update: { name }
    });
    types.push(type);
  }

  const typeByName = Object.fromEntries(types.map(type => [type.name, type]));

  for (const user of SEED_USERS) {
    const participantTypeId = user.participantTypeName ? typeByName[user.participantTypeName]?.id ?? null : null;

    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        authId: crypto.randomUUID(),
        name: user.name,
        email: user.email,
        role: user.role,
        participantTypeId
      },
      update: {
        name: user.name,
        role: user.role,
        participantTypeId
      }
    });
  }

  for (const course of SEED_COURSES) {
    const data = {
      ...course,
      startDate: new Date(course.startDate),
      endDate: new Date(course.endDate),
      preinscriptionStart: new Date(course.preinscriptionStart),
      preinscriptionEnd: new Date(course.preinscriptionEnd)
    };

    const saved = await prisma.course.upsert({
      where: { code: course.code },
      create: data,
      update: data
    });

    for (const type of types) {
      const basePrice = SEED_PRICES[type.name as keyof typeof SEED_PRICES];
      await prisma.coursePrice.upsert({
        where: {
          courseId_participantTypeId: {
            courseId: saved.id,
            participantTypeId: type.id
          }
        },
        create: {
          courseId: saved.id,
          participantTypeId: type.id,
          basePrice
        },
        update: { basePrice }
      });
    }
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
