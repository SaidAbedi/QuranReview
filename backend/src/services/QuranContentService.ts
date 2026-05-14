import { env } from '../config/env';
import { supabaseAdmin } from '../db/client';
import { AppError } from '../types';

// ---- Response types (exported for route handlers) -------------------------

export interface QuranPageSummary {
  id: string;
  pageNumber: number;
  mushafId: string;
  imageUrl: string | null;
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

// Full page content: page metadata + per-surah mappings + optional word data.
// words is present only when includeWords=true was requested.
export interface QuranPageContent extends QuranPageSummary {
  mappings: PageSurahMapping[];
  words?: QfWord[];
}

export interface PageLookupResult {
  pageNumber: number;
}

// ---- Quran.Foundation API response shapes --------------------------------
// These reflect the v4 API response structure. Verify field names against
// the official Quran.Foundation API documentation.

interface QfVerse {
  id: number;
  verse_key: string;     // e.g. "2:5"
  page_number: number;
  juz_number: number;
  hizb_number?: number;
  words?: QfWord[];
}

export interface QfWord {
  id: number;
  position: number;
  text: string;
  line_number?: number;
  page_number?: number;
  char_type_name?: string;
}

interface QfVersesByPageResponse {
  verses: QfVerse[];
}

interface QfPageLookupResponse {
  // Quran.Foundation returns the first page of a chapter/juz.
  page_number: number;
}

// ---- Service ---------------------------------------------------------------

export class QuranContentService {
  private readonly mushafId = env.QURAN_FOUNDATION_DEFAULT_MUSHAF_ID;

  // Makes an authenticated HTTP request to the Quran.Foundation API.
  //
  // ⚠ TODO (Phase 4 setup): Verify authentication with Quran.Foundation docs.
  //   The env vars CLIENT_ID and CLIENT_SECRET suggest OAuth2 client credentials
  //   or a paired key scheme. Possible mechanisms:
  //     A. OAuth2 client_credentials → POST /oauth/token → Bearer <token>
  //     B. HTTP Basic auth → Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)
  //     C. API key header → X-API-Key: <CLIENT_SECRET>
  //
  //   Currently using HTTP Basic (option B) as a placeholder.
  //   Update buildAuthHeader() once the actual mechanism is confirmed.
  //   If OAuth2 (option A) is needed, replace this method with a TokenManager
  //   that caches the token in memory and refreshes before expiry.
  private buildAuthHeader(): string {
    const encoded = Buffer.from(
      `${env.QURAN_FOUNDATION_CLIENT_ID}:${env.QURAN_FOUNDATION_CLIENT_SECRET}`,
    ).toString('base64');
    return `Basic ${encoded}`;
  }

  private async callApi<T>(path: string): Promise<T> {
    const url = `${env.QURAN_FOUNDATION_API_BASE}${path}`;

    const response = await fetch(url, {
      headers: {
        Authorization: this.buildAuthHeader(),
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new AppError(404, `Quran content not found: ${path}`);
      }
      throw new AppError(503, `Quran content provider error (HTTP ${response.status})`);
    }

    return response.json() as Promise<T>;
  }

  // Returns page metadata (id, imageUrl). Creates a minimal DB row on cache miss.
  // Does NOT call the Quran.Foundation API — use getPageContent for full data.
  // Called by assignment creation to resolve a page number to its DB UUID.
  async getPage(pageNumber: number): Promise<QuranPageSummary> {
    const { data: cached } = await supabaseAdmin
      .from('quran_pages')
      .select('id, page_number, mushaf_id, image_url')
      .eq('provider', 'quran_foundation')
      .eq('provider_mushaf_id', this.mushafId)
      .eq('page_number', pageNumber)
      .maybeSingle();

    if (cached) {
      return this.toPageSummary(cached);
    }

    // Not cached: create a minimal row. imageUrl is populated when getPageContent runs.
    const { data: created, error } = await supabaseAdmin
      .from('quran_pages')
      .insert({
        provider: 'quran_foundation',
        provider_mushaf_id: this.mushafId,
        mushaf_id: 'qcf_v2',
        page_number: pageNumber,
      })
      .select('id, page_number, mushaf_id, image_url')
      .single();

    if (error) {
      throw new AppError(500, `Failed to cache Quran page ${pageNumber}`);
    }

    return this.toPageSummary(created);
  }

  // Returns full page content: verse-to-surah/juz mappings and optional word data.
  // Cache-first: reads from quran_page_mappings; falls back to Quran.Foundation API.
  // On API fetch, upserts quran_pages and quran_page_mappings for future requests.
  async getPageContent(
    pageNumber: number,
    includeWords: boolean,
  ): Promise<QuranPageContent> {
    // 1. Check cache
    const { data: cachedMappings } = await supabaseAdmin
      .from('quran_page_mappings')
      .select(`
        surah_number, juz_number,
        first_verse_key, last_verse_key,
        starts_at_ayah, ends_at_ayah,
        verses_count, source_payload,
        quran_pages ( id, mushaf_id, image_url )
      `)
      .eq('page_number', pageNumber)
      .eq('provider_mushaf_id', this.mushafId)
      .order('surah_number', { ascending: true });

    if (cachedMappings && cachedMappings.length > 0) {
      const hasWords = cachedMappings.some((m) => {
        const payload = m.source_payload as Record<string, unknown>;
        return Array.isArray(payload?.verses) &&
          (payload.verses as QfVerse[]).some((v) => v.words?.length);
      });

      // Serve from cache if words are not needed, or if words are already cached.
      if (!includeWords || hasWords) {
        return this.buildContentFromCache(pageNumber, cachedMappings, includeWords);
      }
    }

    // 2. Cache miss (or words requested but not cached) — fetch from API
    return this.fetchAndCache(pageNumber, includeWords);
  }

  // Returns all pages that contain content from a given surah.
  // Checks DB cache first; falls back to API for the starting page only.
  // Full page-range caching happens lazily as pages are viewed.
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

    // API returns only the first page of the surah.
    const data = await this.callApi<QfPageLookupResponse>(
      `/pages/lookup?chapter_number=${surahNumber}&mushaf=${this.mushafId}`,
    );
    return [{ pageNumber: data.page_number }];
  }

  // Returns all pages in a given juz.
  // Cache-first; falls back to API starting page on miss.
  async lookupByJuzNumber(juzNumber: number): Promise<PageLookupResult[]> {
    const { data: cached } = await supabaseAdmin
      .from('quran_page_mappings')
      .select('page_number')
      .eq('juz_number', juzNumber)
      .eq('provider_mushaf_id', this.mushafId)
      .order('page_number', { ascending: true });

    if (cached && cached.length > 0) {
      const uniquePages = [...new Set(cached.map((r) => r.page_number))];
      return uniquePages.map((pageNumber) => ({ pageNumber }));
    }

    const data = await this.callApi<QfPageLookupResponse>(
      `/pages/lookup?juz_number=${juzNumber}&mushaf=${this.mushafId}`,
    );
    return [{ pageNumber: data.page_number }];
  }

  // ---- Private helpers ----------------------------------------------------

  private toPageSummary(row: Record<string, unknown>): QuranPageSummary {
    return {
      id: row.id as string,
      pageNumber: row.page_number as number,
      mushafId: row.mushaf_id as string,
      imageUrl: (row.image_url as string | null) ?? null,
    };
  }

  private buildContentFromCache(
    pageNumber: number,
    mappings: Record<string, unknown>[],
    includeWords: boolean,
  ): QuranPageContent {
    const firstMapping = mappings[0];
    const pageRow = firstMapping.quran_pages as Record<string, unknown> | null;

    const words: QfWord[] = includeWords
      ? mappings.flatMap((m) => {
          const payload = m.source_payload as Record<string, unknown>;
          const verses = (payload?.verses ?? []) as QfVerse[];
          return verses.flatMap((v) => v.words ?? []);
        })
      : [];

    return {
      id: (pageRow?.id as string) ?? '',
      pageNumber,
      mushafId: (pageRow?.mushaf_id as string) ?? 'qcf_v2',
      imageUrl: (pageRow?.image_url as string | null) ?? null,
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
    const path =
      `/verses/by_page/${pageNumber}` +
      `?mushaf=${this.mushafId}&words=${includeWords}&per_page=50`;

    const data = await this.callApi<QfVersesByPageResponse>(path);

    if (!data.verses?.length) {
      throw new AppError(404, `No content found for Quran page ${pageNumber}`);
    }

    // Upsert quran_pages
    const { data: pageRow, error: pageError } = await supabaseAdmin
      .from('quran_pages')
      .upsert(
        {
          provider: 'quran_foundation',
          provider_mushaf_id: this.mushafId,
          mushaf_id: 'qcf_v2',
          page_number: pageNumber,
        },
        { onConflict: 'provider,provider_mushaf_id,page_number' },
      )
      .select('id, page_number, mushaf_id, image_url')
      .single();

    if (pageError) {
      throw new AppError(500, `Failed to cache page ${pageNumber}`);
    }

    // Group verses by surah and upsert one quran_page_mappings row per surah
    const surahGroups = this.groupVersesBySurah(data.verses);
    const mappings: PageSurahMapping[] = [];

    for (const [surahNumStr, surahVerses] of Object.entries(surahGroups)) {
      const surahNum = parseInt(surahNumStr, 10);
      const firstVerse = surahVerses[0];
      const lastVerse = surahVerses[surahVerses.length - 1];

      // Strip word data from the payload if includeWords=false (saves storage).
      const payloadVerses = includeWords
        ? surahVerses
        : surahVerses.map(({ words: _w, ...rest }) => rest);

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

    return {
      id: pageRow.id,
      pageNumber,
      mushafId: pageRow.mushaf_id,
      imageUrl: pageRow.image_url,
      mappings,
      ...(includeWords
        ? { words: data.verses.flatMap((v) => v.words ?? []) }
        : {}),
    };
  }

  // Groups a flat array of verses into { surahNumber: verse[] }.
  private groupVersesBySurah(verses: QfVerse[]): Record<string, QfVerse[]> {
    return verses.reduce<Record<string, QfVerse[]>>((acc, verse) => {
      const surahNum = verse.verse_key.split(':')[0];
      (acc[surahNum] ??= []).push(verse);
      return acc;
    }, {});
  }
}

export const quranContentService = new QuranContentService();
