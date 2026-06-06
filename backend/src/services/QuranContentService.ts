// @quranjs/api is used for TypeScript type annotations only.
// The SDK's HTTP client is NOT used because it sends client_credentials via
// form body, while the Quran.Foundation OAuth2 server requires HTTP Basic auth.
// All HTTP calls go through QfApiClient below.
import type { Verse, Word, Chapter } from '@quranjs/api';
import { env } from '../config/env';
import { supabaseAdmin } from '../db/client';
import { AppError } from '../types';

// ---- App-facing response types (exported for route handlers) ---------------

export interface QuranPageSummary {
  id: string;
  pageNumber: number;
  mushafId: string;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
}

export interface PageSurahMapping {
  surahNumber: number;
  juzNumber: number;
  firstVerseKey: string;
  lastVerseKey: string;
  startsAtAyah: number;
  endsAtAyah: number;
  versesCount: number;
}

export interface QuranPageContent extends QuranPageSummary {
  mappings: PageSurahMapping[];
  verseImages: string[];
  words?: QfWord[];
}

export interface PageLookupResult {
  pageNumber: number;
}

// Stable normalized word shape. Never leak SDK or raw API types beyond this service.
export interface QfWord {
  id: number;
  position: number;
  text: string;
  lineNumber?: number;
  pageNumber?: number;
  charTypeName?: string;
}

// ---- Raw API response types (snake_case, matching Quran.Foundation v4 JSON) -

interface RawWord {
  id?: number;
  position: number;
  text?: string;
  line_number?: number;
  page_number?: number;
  char_type_name?: string;
}

interface RawVerse {
  id: number;
  verse_key: string;
  page_number: number;
  juz_number: number;
  image_url?: string;
  words?: RawWord[];
}

interface RawVersesByPageResponse {
  verses: RawVerse[];
}

interface RawChapter {
  chapter: {
    id: number;
    pages: number[];
  };
}

interface RawVersesByJuzResponse {
  verses: RawVerse[];
}

// ---- OAuth2 token manager (HTTP Basic auth) ---------------------------------
//
// Quran.Foundation's OAuth2 endpoints require HTTP Basic auth for the
// client-credentials grant. Tokens are valid for 1 hour; refreshed proactively
// 60 seconds before expiry.

interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix seconds
}

class QfTokenManager {
  private cached: CachedToken | null = null;
  private readonly tokenUrl: string;
  private readonly basicHeader: string;
  private readonly clientId: string;

  constructor(oauth2Base: string, clientId: string, clientSecret: string) {
    this.tokenUrl = `${oauth2Base}/oauth2/token`;
    this.basicHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    this.clientId = clientId;
  }

  invalidate(): void {
    this.cached = null;
  }

  async getToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cached && this.cached.expiresAt > now + 60) {
      return this.cached.accessToken;
    }
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: this.basicHeader,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'content' }),
    });
    if (!response.ok) {
      throw new AppError(503, `QF token request failed: ${response.status}`);
    }
    const data = await response.json() as { access_token: string; expires_in: number };
    this.cached = {
      accessToken: data.access_token,
      expiresAt: now + data.expires_in,
    };
    return this.cached.accessToken;
  }

  getClientId(): string {
    return this.clientId;
  }
}

// ---- Quran.Foundation API HTTP client --------------------------------------
//
// Content API requires two headers (per Quran.Foundation docs):
//   x-auth-token: <access_token>   (NOT Authorization: Bearer)
//   x-client-id:  <client_id>
// On 401 the cached token is invalidated and the request is retried once.

class QfApiClient {
  private readonly tokens: QfTokenManager;
  private readonly contentApiBase: string;

  constructor(tokens: QfTokenManager, contentApiBase: string) {
    this.tokens = tokens;
    this.contentApiBase = contentApiBase;
  }

  async get<T>(path: string, query: Record<string, string | number | boolean> = {}): Promise<T> {
    return this.doGet<T>(path, query, false);
  }

  private async doGet<T>(
    path: string,
    query: Record<string, string | number | boolean>,
    isRetry: boolean,
  ): Promise<T> {
    const token = await this.tokens.getToken();
    const url = new URL(`${this.contentApiBase}${path}`);
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, String(v));
    }
    console.log(`[QF] ${isRetry ? 'retry ' : ''}GET ${url.toString()}`);
    const response = await fetch(url.toString(), {
      headers: {
        'x-auth-token': token,
        'x-client-id': this.tokens.getClientId(),
        Accept: 'application/json',
      },
    });
    console.log(`[QF] response status: ${response.status}`);
    if (!response.ok) {
      if (response.status === 401 && !isRetry) {
        this.tokens.invalidate();
        return this.doGet<T>(path, query, true);
      }
      if (response.status === 404) throw new AppError(404, `Quran content not found: ${path}`);
      throw new AppError(503, `Quran content provider error: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }
}

// ---- Service ---------------------------------------------------------------

export class QuranContentService {
  private readonly mushafId = env.QURAN_FOUNDATION_DEFAULT_MUSHAF_ID;
  private readonly api = new QfApiClient(
    new QfTokenManager(
      env.QURAN_FOUNDATION_OAUTH_BASE_URL,
      env.QURAN_FOUNDATION_CLIENT_ID,
      env.QURAN_FOUNDATION_CLIENT_SECRET,
    ),
    env.QURAN_FOUNDATION_CONTENT_BASE_URL,
  );

  // Returns page metadata (id, imageUrl, width, height). Creates a minimal DB row on cache miss.
  // Does NOT call Quran.Foundation — use getPageContent for full data.
  // Called by assignment creation to resolve a page number to its DB UUID,
  // and by GET /api/quran/pages/:pageNumber on the mobile-facing route.
  async getPage(pageNumber: number): Promise<QuranPageSummary> {
    const { data: cached } = await supabaseAdmin
      .from('quran_pages')
      .select('id, page_number, mushaf_id, storage_path, image_url, width, height')
      .eq('provider', 'quran_foundation')
      .eq('provider_mushaf_id', this.mushafId)
      .eq('page_number', pageNumber)
      .maybeSingle();

    if (cached) return this.toPageSummary(cached);

    const { data: created, error } = await supabaseAdmin
      .from('quran_pages')
      .insert({
        provider: 'quran_foundation',
        provider_mushaf_id: this.mushafId,
        mushaf_id: 'qcf_v2',
        page_number: pageNumber,
      })
      .select('id, page_number, mushaf_id, storage_path, image_url, width, height')
      .single();

    if (error) throw new AppError(500, `Failed to cache Quran page ${pageNumber}`);
    return this.toPageSummary(created);
  }

  // Cache-first. Falls back to Quran.Foundation API on miss.
  // Upserts quran_pages (with image_url) and quran_page_mappings on fetch.
  async getPageContent(pageNumber: number, includeWords: boolean): Promise<QuranPageContent> {
    const { data: cachedMappings } = await supabaseAdmin
      .from('quran_page_mappings')
      .select(`
        surah_number, juz_number,
        first_verse_key, last_verse_key,
        starts_at_ayah, ends_at_ayah,
        verses_count, source_payload,
        quran_pages ( id, mushaf_id, storage_path, image_url, width, height )
      `)
      .eq('page_number', pageNumber)
      .eq('provider_mushaf_id', this.mushafId)
      .order('surah_number', { ascending: true });

    if (cachedMappings && cachedMappings.length > 0) {
      const hasWords = cachedMappings.some((m) => {
        const payload = m.source_payload as Record<string, unknown>;
        return Array.isArray(payload?.verses) &&
          (payload.verses as Array<Record<string, unknown>>).some(
            (v) => Array.isArray(v.words) && (v.words as unknown[]).length > 0,
          );
      });
      if (!includeWords || hasWords) {
        return this.buildContentFromCache(pageNumber, cachedMappings, includeWords);
      }
    }

    return this.fetchAndCache(pageNumber, includeWords);
  }

  // Cache-first surah → page lookup.
  // SDK's Chapter.pages returns all pages; replicated here via /chapters/{n}.
  async lookupBySurahNumber(surahNumber: number): Promise<PageLookupResult[]> {
    const { data: cached } = await supabaseAdmin
      .from('quran_page_mappings')
      .select('page_number')
      .eq('surah_number', surahNumber)
      .eq('provider_mushaf_id', this.mushafId)
      .order('page_number', { ascending: true });

    if (cached && cached.length > 0) {
      return cached.map((r) => ({ pageNumber: r.page_number }));
    }

    const data = await this.api.get<RawChapter>(`/chapters/${surahNumber}`);
    return data.chapter.pages.map((p) => ({ pageNumber: p }));
  }

  // Cache-first juz → page lookup.
  async lookupByJuzNumber(juzNumber: number): Promise<PageLookupResult[]> {
    const { data: cached } = await supabaseAdmin
      .from('quran_page_mappings')
      .select('page_number')
      .eq('juz_number', juzNumber)
      .eq('provider_mushaf_id', this.mushafId)
      .order('page_number', { ascending: true });

    if (cached && cached.length > 0) {
      const unique = [...new Set(cached.map((r) => r.page_number))];
      return unique.map((pageNumber) => ({ pageNumber }));
    }

    // Fetch only the first verse to get the starting page number.
    const data = await this.api.get<RawVersesByJuzResponse>(`/verses/by_juz/${juzNumber}`, {
      mushaf: this.mushafId,
      per_page: 1,
    });
    if (!data.verses?.length) throw new AppError(404, `No content for juz ${juzNumber}`);
    return [{ pageNumber: data.verses[0].page_number }];
  }

  // ---- Private helpers ----------------------------------------------------

  private toPageSummary(row: Record<string, unknown>): QuranPageSummary {
    const storagePath = row.storage_path as string | null;
    const imageUrl = storagePath
      ? `${env.SUPABASE_URL}/storage/v1/object/public/quran-page-images/${storagePath}`
      : ((row.image_url as string | null) ?? null);
    return {
      id: row.id as string,
      pageNumber: row.page_number as number,
      mushafId: row.mushaf_id as string,
      imageUrl,
      width: (row.width as number | null) ?? null,
      height: (row.height as number | null) ?? null,
    };
  }

  private normalizeImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    return url.startsWith('//') ? `https:${url}` : url;
  }

  private buildContentFromCache(
    pageNumber: number,
    mappings: Record<string, unknown>[],
    includeWords: boolean,
  ): QuranPageContent {
    const pageRow = (mappings[0].quran_pages as Record<string, unknown> | null);
    const words: QfWord[] = includeWords
      ? mappings.flatMap((m) => {
          const payload = m.source_payload as Record<string, unknown>;
          const verses = (payload?.verses ?? []) as Array<Record<string, unknown>>;
          return verses.flatMap((v) =>
            ((v.words ?? []) as Array<Record<string, unknown>>).map(this.normalizeWord),
          );
        })
      : [];

    const verseImages = mappings.flatMap((m) => {
      const payload = m.source_payload as { verses?: Array<{ image_url?: string }> };
      return (payload?.verses ?? [])
        .map((v) => this.normalizeImageUrl(v.image_url))
        .filter((url): url is string => url !== null);
    });

    const storagePath = pageRow?.storage_path as string | null;
    const imageUrl = storagePath
      ? `${env.SUPABASE_URL}/storage/v1/object/public/quran-page-images/${storagePath}`
      : ((pageRow?.image_url as string | null) ?? null);

    return {
      id: (pageRow?.id as string) ?? '',
      pageNumber,
      mushafId: (pageRow?.mushaf_id as string) ?? 'qcf_v2',
      imageUrl,
      width: (pageRow?.width as number | null) ?? null,
      height: (pageRow?.height as number | null) ?? null,
      verseImages,
      mappings: mappings.map((m) => ({
        surahNumber: m.surah_number as number,
        juzNumber: m.juz_number as number,
        firstVerseKey: (m.first_verse_key as string) ?? '',
        lastVerseKey: (m.last_verse_key as string) ?? '',
        startsAtAyah: (m.starts_at_ayah as number) ?? 1,
        endsAtAyah: (m.ends_at_ayah as number) ?? 1,
        versesCount: (m.verses_count as number) ?? 0,
      })),
      ...(includeWords ? { words } : {}),
    };
  }

  private async fetchAndCache(
    pageNumber: number,
    includeWords: boolean,
  ): Promise<QuranPageContent> {
    const data = await this.api.get<RawVersesByPageResponse>(`/verses/by_page/${pageNumber}`, {
      mushaf: this.mushafId,
      words: includeWords,
      fields: 'image_url',
      per_page: 50,
    });

    if (!data.verses?.length) {
      throw new AppError(404, `No content found for Quran page ${pageNumber}`);
    }

    const imageUrl = data.verses[0]?.image_url ?? null;
    const upsertPageData: Record<string, unknown> = {
      provider: 'quran_foundation',
      provider_mushaf_id: this.mushafId,
      mushaf_id: 'qcf_v2',
      page_number: pageNumber,
    };
    if (imageUrl) upsertPageData.image_url = imageUrl;

    const { data: pageRow, error: pageError } = await supabaseAdmin
      .from('quran_pages')
      .upsert(upsertPageData, { onConflict: 'provider,provider_mushaf_id,page_number' })
      .select('id, page_number, mushaf_id, storage_path, image_url, width, height')
      .single();

    if (pageError) throw new AppError(500, `Failed to cache page ${pageNumber}`);

    const surahGroups = this.groupVersesBySurah(data.verses);
    const mappings: PageSurahMapping[] = [];

    for (const [surahNumStr, surahVerses] of Object.entries(surahGroups)) {
      const surahNum = parseInt(surahNumStr, 10);
      const firstVerse = surahVerses[0];
      const lastVerse = surahVerses[surahVerses.length - 1];

      const payloadVerses = includeWords
        ? surahVerses.map(this.serializeVerse)
        : surahVerses.map(({ words: _w, ...rest }) => this.serializeVerse(rest as RawVerse));

      await supabaseAdmin
        .from('quran_page_mappings')
        .upsert(
          {
            quran_page_id: pageRow.id,
            provider: 'quran_foundation',
            provider_mushaf_id: this.mushafId,
            page_number: pageNumber,
            surah_number: surahNum,
            juz_number: firstVerse.juz_number,
            starts_at_ayah: parseInt(firstVerse.verse_key.split(':')[1], 10),
            ends_at_ayah: parseInt(lastVerse.verse_key.split(':')[1], 10),
            first_verse_key: firstVerse.verse_key,
            last_verse_key: lastVerse.verse_key,
            first_verse_id: firstVerse.id,
            last_verse_id: lastVerse.id,
            verses_count: surahVerses.length,
            source_payload: { verses: payloadVerses },
          },
          { onConflict: 'quran_page_id,surah_number' },
        );

      mappings.push({
        surahNumber: surahNum,
        juzNumber: firstVerse.juz_number,
        firstVerseKey: firstVerse.verse_key,
        lastVerseKey: lastVerse.verse_key,
        startsAtAyah: parseInt(firstVerse.verse_key.split(':')[1], 10),
        endsAtAyah: parseInt(lastVerse.verse_key.split(':')[1], 10),
        versesCount: surahVerses.length,
      });
    }

    const verseImages = data.verses
      .map((v) => this.normalizeImageUrl(v.image_url))
      .filter((url): url is string => url !== null);

    const fetchedStoragePath = pageRow.storage_path as string | null;
    const fetchedImageUrl = fetchedStoragePath
      ? `${env.SUPABASE_URL}/storage/v1/object/public/quran-page-images/${fetchedStoragePath}`
      : (pageRow.image_url as string | null);

    return {
      id: pageRow.id,
      pageNumber,
      mushafId: pageRow.mushaf_id,
      imageUrl: fetchedImageUrl,
      width: (pageRow.width as number | null) ?? null,
      height: (pageRow.height as number | null) ?? null,
      verseImages,
      mappings,
      ...(includeWords
        ? { words: data.verses.flatMap((v) => (v.words ?? []).map(this.normalizeWord)) }
        : {}),
    };
  }

  private groupVersesBySurah(verses: RawVerse[]): Record<string, RawVerse[]> {
    return verses.reduce<Record<string, RawVerse[]>>((acc, verse) => {
      const surahNum = verse.verse_key.split(':')[0];
      (acc[surahNum] ??= []).push(verse);
      return acc;
    }, {});
  }

  private serializeVerse = (verse: RawVerse): Record<string, unknown> => {
    return {
      verse_key: verse.verse_key,
      page_number: verse.page_number,
      juz_number: verse.juz_number,
      ...(verse.words ? { words: verse.words.map(this.normalizeWord) } : {}),
    };
  };

  // Normalizes raw API words (snake_case) and cached words to our stable QfWord shape.
  private normalizeWord = (w: RawWord | Record<string, unknown>): QfWord => {
    const word = w as Record<string, unknown>;
    return {
      id: (word.id as number) ?? 0,
      position: word.position as number,
      text: (word.text as string) ?? '',
      lineNumber: (word.line_number ?? word.lineNumber) as number | undefined,
      pageNumber: (word.page_number ?? word.pageNumber) as number | undefined,
      charTypeName: (word.char_type_name ?? word.charTypeName) as string | undefined,
    };
  };
}

// The _Verse, _Word, _Chapter type imports from @quranjs/api are retained
// for future use when the SDK's auth issue is resolved upstream.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _SdkTypes = Verse | Word | Chapter;

export const quranContentService = new QuranContentService();
