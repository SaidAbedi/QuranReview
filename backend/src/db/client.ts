import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import WebSocket from 'ws';
import { env } from '../config/env';
import { AppError } from '../types';

// Service-role client — full DB access, used for all server-side operations.
// Never expose this key to the mobile app or client-side code.
// Node 18 has no native WebSocket; pass 'ws' so realtime-js doesn't throw.
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: WebSocket as any,
    },
  },
);

// pg Pool — used for multi-statement transactions (submission + attempt creation).
// Supabase JS client does not support BEGIN/COMMIT transactions.
export const pgPool = env.DATABASE_URL
  ? new pg.Pool({
      connectionString: env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    })
  : null;

// Throws at call-time if DATABASE_URL was not configured.
export function requirePgPool(): pg.Pool {
  if (!pgPool) {
    throw new AppError(500, 'DATABASE_URL is not configured — transaction operations unavailable');
  }
  return pgPool;
}
