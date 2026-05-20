#!/usr/bin/env node
/**
 * One-shot migration runner.
 * Usage: node scripts/run-migration.js <path-to-migration.sql>
 *
 * Reads DATABASE_URL from backend/.env (or process.env).
 * Connects as the postgres superuser (bypasses RLS — appropriate for migrations).
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env from the backend directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node scripts/run-migration.js <path-to-migration.sql>');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(migrationFile), 'utf8');
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    console.log('Connected. Running migration:', migrationFile);
    await client.query(sql);
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
