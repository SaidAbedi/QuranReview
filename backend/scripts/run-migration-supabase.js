#!/usr/bin/env node
/**
 * Alternative migration runner using Supabase service role.
 * Use this when DATABASE_URL is not available.
 * Executes DDL via the pg pool using the Supabase connection pooler with
 * service_role JWT as the password (Supabase Supavisor supports JWT auth).
 *
 * Usage: node scripts/run-migration-supabase.js <path-to-migration.sql>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const https = require('https');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node scripts/run-migration-supabase.js <path-to-migration.sql>');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(migrationFile), 'utf8');

// Extract project ref from SUPABASE_URL
// e.g. https://aqimqiyqtagwnjgrivpq.supabase.co → aqimqiyqtagwnjgrivpq
const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];

// Supabase Management API endpoint for running SQL
// Requires Supabase access token (different from service role key).
// We use the pg REST SQL endpoint instead via the supabase-js admin client workaround.

// Split the SQL into individual statements and execute each via
// a fetch to the Supabase REST API using a custom RPC trick.
// Since PostgREST doesn't support DDL, we use the pg module with
// the Supabase transaction pooler (port 6543) which accepts JWT as password.

const { Client } = require('pg');

const dbUrl = `postgresql://postgres.${projectRef}:${SERVICE_ROLE_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

(async () => {
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected via Supabase pooler. Running migration:', migrationFile);
    await client.query(sql);
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
