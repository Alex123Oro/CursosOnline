import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('Configura SUPABASE_URL y SUPABASE_SECRET_KEY en backend/.env.');
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);

const logSupabaseAuthError = (operation: string, error: {
  message: string;
  status?: number;
  code?: string;
  name?: string;
  details?: string;
  hint?: string;
}) => {
  console.error(`Error de Supabase durante ${operation}:`, {
    message: error.message,
    status: error.status,
    code: error.code,
    name: error.name,
    details: error.details,
    hint: error.hint
  });
  if (error.status === 500) {
    console.error(
      'Supabase Auth alcanzó PostgreSQL, pero la transacción de alta falló. Revisa Logs > Auth y Logs > Postgres; ejecuta en SQL Editor la consulta de solo lectura de prisma/supabase-auth-diagnostics.sql. El seed no elimina ni modifica triggers automáticamente.'
    );
  }
};

const reportAuthUserTriggers = async () => {
  try {
    const triggers = await prisma.$queryRaw<Array<{
      trigger_name: string;
      trigger_definition: string;
      function_schema: string;
      function_name: string;
      is_security_definer: boolean;
    }>>`
      SELECT
        trigger_row.tgname AS trigger_name,
        pg_get_triggerdef(trigger_row.oid, true) AS trigger_definition,
        function_ns.nspname AS function_schema,
        function_row.proname AS function_name,
        function_row.prosecdef AS is_security_definer
      FROM pg_trigger AS trigger_row
      JOIN pg_class AS table_row ON table_row.oid = trigger_row.tgrelid
      JOIN pg_namespace AS table_ns ON table_ns.oid = table_row.relnamespace
      JOIN pg_proc AS function_row ON function_row.oid = trigger_row.tgfoid
      JOIN pg_namespace AS function_ns ON function_ns.oid = function_row.pronamespace
      WHERE table_ns.nspname = 'auth'
        AND table_row.relname = 'users'
        AND NOT trigger_row.tgisinternal
      ORDER BY trigger_row.tgname
    `;

    if (triggers.length === 0) {
      console.error('Diagnostico: PostgreSQL no muestra triggers personalizados sobre auth.users. Revisa igualmente Logs > Auth y Logs > Postgres por restricciones y errores de permisos.');
    } else {
      console.error('Triggers encontrados en auth.users:', triggers);
    }
  } catch (diagnosticError) {
    const message = diagnosticError instanceof Error ? diagnosticError.message : 'consulta no disponible';
    console.error(`No se pudieron listar los triggers desde DATABASE_URL (${message}). Ejecuta prisma/supabase-auth-diagnostics.sql en Supabase SQL Editor.`);
  }
};

const participants = [
  {
    name: 'Ana Admin',
    role: 'ADMIN' as const,
    typeName: null,
    email: 'admin@eva.local',
    password: 'administrador1234@'
  },
  {
    name: 'Ing. Carla Mendoza',
    role: 'INSTRUCTOR' as const,
    typeName: null,
    email: 'carla.instructor@eva.local',
    password: 'instructor123@'
  },
  {
    name: 'Luis Estudiante',
    role: 'PARTICIPANT' as const,
    typeName: 'Estudiante',
    email: 'luis@eva.local',
    password: 'participante123@'
  }
];

const run = async () => {
  const participantType = await prisma.participantType.upsert({
    where: { name: 'Estudiante' },
    create: { name: 'Estudiante' },
    update: {}
  });

  const { data: listedUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    logSupabaseAuthError('la consulta de usuarios Auth', listError);
    throw new Error(`No se pudieron consultar las cuentas de Supabase Auth: ${listError.message}`);
  }

  for (const account of participants) {
    const email = account.email?.trim().toLowerCase();
    const password = account.password;
    if (!email || !password || password.startsWith('REEMPLAZAR_')) {
      throw new Error(`Configura correo y contraseña para el rol ${account.role} en backend/.env.`);
    }
    if (password.length < 12) {
      throw new Error(`La contraseña de ${account.role} debe tener al menos 12 caracteres.`);
    }

    let authUser = listedUsers.users.find(user => user.email?.toLowerCase() === email) ?? null;
    if (!authUser) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: account.name }
      });
      if (error) {
        logSupabaseAuthError(`la creación de ${email}`, error);
        if (error.status === 500) await reportAuthUserTriggers();
        throw new Error(`No se pudo crear la cuenta ${email}: ${error.message}`);
      }
      authUser = data.user;
      listedUsers.users.push(authUser);
      console.log(`Cuenta creada para rol ${account.role}: ${email}`);
    } else {
      console.log(`La cuenta Auth ya existe para rol ${account.role}: ${email}; no se modificó su contraseña.`);
    }

    await prisma.user.upsert({
      where: { email },
      create: {
        authId: authUser.id,
        name: account.name,
        email,
        role: account.role,
        participantTypeId: account.typeName ? participantType.id : null
      },
      update: {
        authId: authUser.id,
        name: account.name,
        role: account.role,
        participantTypeId: account.typeName ? participantType.id : null
      }
    });
  }

  console.log('Perfiles demo vinculados a Supabase Auth. Las contraseñas no se muestran ni se guardan en el repositorio.');
};

run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
