import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const required = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'DEMO_ADMIN_EMAIL',
  'DEMO_ADMIN_PASSWORD',
  'DEMO_INSTRUCTOR_EMAIL',
  'DEMO_INSTRUCTOR_PASSWORD',
  'DEMO_PARTICIPANT_EMAIL',
  'DEMO_PARTICIPANT_PASSWORD'
];

for (const key of required) {
  if (!process.env[key] || process.env[key]?.trim() === '') {
    throw new Error(`Falta la variable ${key} en backend/.env`);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const accounts = [
  {
    name: 'Ana Admin',
    email: process.env.DEMO_ADMIN_EMAIL,
    password: process.env.DEMO_ADMIN_PASSWORD,
    role: 'ADMIN'
  },
  {
    name: 'Ing. Carla Mendoza',
    email: process.env.DEMO_INSTRUCTOR_EMAIL,
    password: process.env.DEMO_INSTRUCTOR_PASSWORD,
    role: 'INSTRUCTOR'
  },
  {
    name: 'Luis Estudiante',
    email: process.env.DEMO_PARTICIPANT_EMAIL,
    password: process.env.DEMO_PARTICIPANT_PASSWORD,
    role: 'PARTICIPANT'
  }
];

const ensurePassword = (role, password) => {
  if (password.length < 12) {
    throw new Error(`La contraseña de ${role} debe tener al menos 12 caracteres.`);
  }
};

const main = async () => {
  for (const account of accounts) {
    ensurePassword(account.role, account.password);

    const { data: existing, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });

    if (listError) {
      throw new Error(`No se pudo consultar Auth: ${listError.message}`);
    }

    let authUser = existing.users.find((user) => user.email?.toLowerCase() === account.email.toLowerCase());

    if (!authUser) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { full_name: account.name }
      });

      if (error) {
        throw new Error(`No se pudo crear la cuenta ${account.email}: ${error.message}`);
      }

      authUser = data.user;
    }

    await prisma.user.upsert({
      where: { email: account.email },
      create: {
        authId: authUser.id,
        name: account.name,
        email: account.email,
        role: account.role,
        participantTypeId: account.role === 'PARTICIPANT' ? 1 : null
      },
      update: {
        authId: authUser.id,
        name: account.name,
        role: account.role,
        participantTypeId: account.role === 'PARTICIPANT' ? 1 : null
      }
    });

    console.log(`Cuenta configurada: ${account.email} (${account.role})`);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
