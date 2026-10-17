import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  const value = process.env[key];
  if (!value) continue;
  const url = new URL(value);
  url.searchParams.set('connect_timeout', '8');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    await db.$queryRaw`SELECT 1`;
    console.log(JSON.stringify({ setting: key, reachable: true }));
  } catch (error) {
    console.log(JSON.stringify({ setting: key, reachable: false, code: error.code ?? 'CONNECTION_ERROR' }));
  } finally { await db.$disconnect(); }
}
