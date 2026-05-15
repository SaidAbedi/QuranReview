import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '3000', 10),

  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_ANON_KEY: requireEnv('SUPABASE_ANON_KEY'),

  QURAN_FOUNDATION_CLIENT_ID: requireEnv('QURAN_FOUNDATION_CLIENT_ID'),
  QURAN_FOUNDATION_CLIENT_SECRET: requireEnv('QURAN_FOUNDATION_CLIENT_SECRET'),
  // Optional: override SDK base URLs for prelive/staging environments.
  // If not set the SDK defaults to https://apis.quran.foundation.
  QURAN_FOUNDATION_CONTENT_BASE_URL: process.env.QURAN_FOUNDATION_CONTENT_BASE_URL,
  QURAN_FOUNDATION_OAUTH_BASE_URL: process.env.QURAN_FOUNDATION_OAUTH_BASE_URL,
  QURAN_FOUNDATION_DEFAULT_MUSHAF_ID: parseInt(
    process.env.QURAN_FOUNDATION_DEFAULT_MUSHAF_ID ?? '1',
    10,
  ),
} as const;
