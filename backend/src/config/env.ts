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

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '3000', 10),

  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_ANON_KEY: requireEnv('SUPABASE_ANON_KEY'),

  QURAN_FOUNDATION_ENV: qfEnv,
  QURAN_FOUNDATION_CLIENT_ID: qfClientId,
  QURAN_FOUNDATION_CLIENT_SECRET: qfClientSecret,
  QURAN_FOUNDATION_OAUTH_BASE_URL: QF_OAUTH_URLS[qfEnv],
  QURAN_FOUNDATION_DEFAULT_MUSHAF_ID: parseInt(
    process.env.QURAN_FOUNDATION_DEFAULT_MUSHAF_ID ?? '1',
    10,
  ),
} as const;
