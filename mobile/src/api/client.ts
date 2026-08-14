import { supabase } from '@/lib/supabase';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session?.access_token) return null;

  // Check if token expires within 60 seconds; refresh if needed
  const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
  const now = Date.now();
  const timeUntilExpiry = expiresAt ? expiresAt - now : null;

  if (timeUntilExpiry && timeUntilExpiry < 60_000) {
    // Token expires soon; refresh silently
    if (session.refresh_token) {
      const { data: refreshed } = await supabase.auth.refreshSession({
        refresh_token: session.refresh_token,
      });
      return refreshed?.session?.access_token ?? null;
    }
  }

  return session.access_token;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error?.message) message = data.error.message;
      else if (typeof data?.error === 'string') message = data.error;
    } catch {
      // ignore JSON parse error
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Protocol-relative URLs (//host/path) don't work in React Native.
// The Quran Foundation CDN returns them; normalize to https: here.
export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('//')) return 'https:' + url;
  return url;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
