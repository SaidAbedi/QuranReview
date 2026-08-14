import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Quran.Foundation has two environments with different OAuth2 endpoints
// and separate client credentials. Content API base is the same for both.
const QF_OAUTH_URLS = {
  prelive: 'https://prelive-oauth2.quran.foundation',
  production: 'https://oauth2.quran.foundation',
} as const;

type QfEnv = keyof typeof QF_OAUTH_URLS;

const qfEnv = (process.env.QURAN_FOUNDATION_ENV ?? 'prelive') as QfEnv;
if (!(qfEnv in QF_OAUTH_URLS)) {
  throw new Error(
    `QURAN_FOUNDATION_ENV must be "prelive" or "production", got "${qfEnv}"`,
  );
}

const qfClientId =
  qfEnv === 'production'
    ? requireEnv('QURAN_FOUNDATION_PROD_CLIENT_ID')
    : requireEnv('QURAN_FOUNDATION_PRELIVE_CLIENT_ID');

const qfClientSecret =
  qfEnv === 'production'
    ? requireEnv('QURAN_FOUNDATION_PROD_CLIENT_SECRET')
    : requireEnv('QURAN_FOUNDATION_PRELIVE_CLIENT_SECRET');

const QF_CONTENT_API_DEFAULT = 'https://apis.quran.foundation/content/api/v4';

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '3000', 10),

  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_ANON_KEY: requireEnv('SUPABASE_ANON_KEY'),

  QURAN_FOUNDATION_ENV: qfEnv,
  QURAN_FOUNDATION_CLIENT_ID: qfClientId,
  QURAN_FOUNDATION_CLIENT_SECRET: qfClientSecret,
  // OAUTH_BASE_URL: explicit override wins; otherwise derived from QURAN_FOUNDATION_ENV.
  QURAN_FOUNDATION_OAUTH_BASE_URL:
    process.env.QURAN_FOUNDATION_OAUTH_BASE_URL || QF_OAUTH_URLS[qfEnv],
  // CONTENT_BASE_URL: explicit override wins; otherwise default production URL.
  // Note: prelive OAuth2 tokens are rejected by the production content API.
  // Leave blank unless Quran.Foundation confirms a compatible prelive content endpoint.
  QURAN_FOUNDATION_CONTENT_BASE_URL:
    process.env.QURAN_FOUNDATION_CONTENT_BASE_URL || QF_CONTENT_API_DEFAULT,
  QURAN_FOUNDATION_DEFAULT_MUSHAF_ID: parseInt(
    process.env.QURAN_FOUNDATION_DEFAULT_MUSHAF_ID ?? '1',
    10,
  ),

  // Direct Postgres connection string — required for transaction operations.
  // Found in Supabase Dashboard → Settings → Database → Connection string → URI.
  DATABASE_URL: process.env.DATABASE_URL ?? null,

  // Controls whether the server auto-creates Supabase Storage buckets on startup.
  // Defaults to true in non-production environments.
  // In production, set AUTO_CREATE_STORAGE_BUCKETS=true only during initial deploy;
  // thereafter buckets should exist and this should be left unset (false).
  AUTO_CREATE_STORAGE_BUCKETS:
    process.env.AUTO_CREATE_STORAGE_BUCKETS === 'true' ||
    (process.env.AUTO_CREATE_STORAGE_BUCKETS === undefined &&
      (process.env.NODE_ENV ?? 'development') !== 'production'),

  // CORS: comma-separated list of allowed origins
  // Default (dev): localhost:19000 (Expo), localhost:3000 (local)
  // Production: Set to your actual domain
  CORS_ORIGINS:
    process.env.CORS_ORIGINS ??
    'http://localhost:19000,http://localhost:3000,http://127.0.0.1:19000,http://127.0.0.1:3000',
} as const;
