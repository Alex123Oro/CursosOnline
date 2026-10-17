import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Reference catalog only. Accounts, courses and academic records must be real.
const prisma = new PrismaClient();
try {
  for (const name of ['Estudiante', 'Docente', 'Administrativo', 'Externo']) {
    await prisma.participantType.upsert({ where: { name }, create: { name }, update: {} });
  }
  console.log('Catalogo de tipos de participante inicializado.');
} finally {
  await prisma.$disconnect();
}
