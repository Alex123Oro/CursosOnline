import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { writeFile } from 'node:fs/promises';
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('connect_timeout', '15');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
try {
  const columns = await db.$queryRaw`SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`;
  const references = await db.$queryRaw`SELECT conrelid::regclass::text AS table_name,confrelid::regclass::text AS referenced_table,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace`;
  const constraints = await db.$queryRaw`SELECT conrelid::regclass::text AS table_name,conname AS name,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conrelid,conname`;
  const triggers = await db.$queryRaw`SELECT tgrelid::regclass::text AS table_name,tgname AS name,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)`;
  await writeFile('.local/database-schema.json', JSON.stringify({ columns, references,constraints,triggers }, null, 2));
  console.log(JSON.stringify({ tables: [...new Set(columns.map(row => row.table_name))], foreignKeys: references.length }));
} catch (error) {
  console.log(JSON.stringify({ error: error.code ?? 'CONNECTION_ERROR' }));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
