#!/usr/bin/env node
/**
 * Applies numbered SQL migrations in order from ./migrations/.
 * Requires DATABASE_URL in the environment (set in backend/.env or pass inline).
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node database/run-migrations.mjs
 *
 * The DATABASE_URL can be found in Supabase Dashboard:
 *   Settings → Database → Connection string → URI (direct connection)
 *   Format: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

// Load backend/.env if DATABASE_URL not already set
const __dir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dir, '../backend/.env') });

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  console.error('');
  console.error('Find it in Supabase Dashboard → Settings → Database → Connection string → URI');
  console.error('Then add to backend/.env:');
  console.error('  DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres');
  process.exit(1);
}

const migrationsDir = join(__dir, 'migrations');

const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log(`Found ${files.length} migration file(s):\n${files.map(f => '  ' + f).join('\n')}\n`);

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log('Connected to Postgres.\n');

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`Applying ${file}...`);
    try {
      await client.query(sql);
      console.log(`  ✓ ${file} applied\n`);
    } catch (err) {
      // IF NOT EXISTS / ON CONFLICT guards make most statements idempotent.
      // Some ALTER TABLE statements will fail if the constraint already exists.
      if (
        err.message.includes('already exists') ||
        err.message.includes('does not exist') && err.message.includes('IF NOT EXISTS')
      ) {
        console.log(`  ⚠ Skipped (already applied): ${err.message}\n`);
      } else {
        console.error(`  ✗ FAILED: ${err.message}`);
        console.error('  Stopping. Fix the error and re-run.');
        process.exit(1);
      }
    }
  }

  console.log('All migrations applied.');
} finally {
  await client.end();
}
