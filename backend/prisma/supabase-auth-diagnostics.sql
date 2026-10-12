-- Read-only diagnostic for `Database error creating new user`.
-- Run this in Supabase Dashboard > SQL Editor as postgres, then inspect any
-- non-internal triggers and their functions before changing database objects.
SELECT
  trigger_row.tgname AS trigger_name,
  pg_get_triggerdef(trigger_row.oid, true) AS trigger_definition,
  function_ns.nspname AS function_schema,
  function_row.proname AS function_name,
  function_row.prosecdef AS is_security_definer,
  pg_get_functiondef(function_row.oid) AS function_definition
FROM pg_trigger AS trigger_row
JOIN pg_class AS table_row ON table_row.oid = trigger_row.tgrelid
JOIN pg_namespace AS table_ns ON table_ns.oid = table_row.relnamespace
JOIN pg_proc AS function_row ON function_row.oid = trigger_row.tgfoid
JOIN pg_namespace AS function_ns ON function_ns.oid = function_row.pronamespace
WHERE table_ns.nspname = 'auth'
  AND table_row.relname = 'users'
  AND NOT trigger_row.tgisinternal
ORDER BY trigger_row.tgname;

-- Check for custom constraints added to auth.users.
SELECT
  constraint_row.conname AS constraint_name,
  pg_get_constraintdef(constraint_row.oid, true) AS constraint_definition
FROM pg_constraint AS constraint_row
JOIN pg_class AS table_row ON table_row.oid = constraint_row.conrelid
JOIN pg_namespace AS table_ns ON table_ns.oid = table_row.relnamespace
WHERE table_ns.nspname = 'auth'
  AND table_row.relname = 'users'
ORDER BY constraint_row.conname;
