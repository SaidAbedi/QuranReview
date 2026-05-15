import { createServerClient } from '@quranjs/api/server';
import type { Verse, Word, Chapter, PageNumber, ChapterId, JuzNumber } from '@quranjs/api';
import { env } from '../config/env';
import { supabaseAdmin } from '../db/client';
import { AppError } from '../types';

// ---- App-facing response types (exported for route handlers) ---------------

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

// Stable normalized word shape returned to callers.
// Never leak the SDK Word type outside this service.
export interface QfWord {
  id: number;
  position: number;
  text: string;
  lineNumber?: number;
  pageNumber?: number;
  charTypeName?: string;
}

// ---- Service ---------------------------------------------------------------

export class QuranContentService {
  private readonly mushafId = env.QURAN_FOUNDATION_DEFAULT_MUSHAF_ID;

  // SDK client — handles OAuth2 client-credentials token acquisition, caching,
  // and refresh automatically. Only instantiated on the server; never used
  // from mobile. Credentials and OAuth2 base URL are resolved in env.ts based
  // on QURAN_FOUNDATION_ENV (prelive | production).
  private readonly client = createServerClient({
    clientId: env.QURAN_FOUNDATION_CLIENT_ID,
    clientSecret: env.QURAN_FOUNDATION_CLIENT_SECRET,
    services: {
      oauth2BaseUrl: env.QURAN_FOUNDATION_OAUTH_BASE_URL,
    },
  });

  // Returns page metadata (id, imageUrl). Creates a minimal DB row on cache miss.
  // Does NOT call Quran.Foundation — use getPageContent for full data.
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

    // Not cached: create a minimal row. image_url is populated when
    // fetchAndCache runs (getPageContent or the first content request).
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
  // Cache-first: reads from quran_page_mappings; falls back to SDK on miss.
  // On SDK fetch, upserts quran_pages (including image_url) and quran_page_mappings.
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
          (payload.verses as Array<Record<string, unknown>>).some(
            (v) => Array.isArray(v.words) && (v.words as unknown[]).length > 0,
          );
      });

      // Serve from cache if words are not needed, or if words are already cached.
      if (!includeWords || hasWords) {
        return this.buildContentFromCache(pageNumber, cachedMappings, includeWords);
      }
    }

    // 2. Cache miss (or words requested but not cached) — fetch via SDK
    return this.fetchAndCache(pageNumber, includeWords);
  }

  // Returns all pages that contain content from a given surah.
  // Cache-first: checks DB; falls back to SDK on miss.
  // SDK returns all pages for the surah (Chapter.pages array), so the first
  // API call is more complete than the old raw-HTTP fallback (which returned
  // only the first page).
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

    // SDK cache miss: chapters.get returns the full Chapter object including
    // the pages array (all page numbers containing this surah).
    const chapter = await this.sdkGetChapter(surahNumber);
    return chapter.pages.map((p) => ({ pageNumber: p }));
  }

  // Returns all pages in a given juz.
  // Cache-first; falls back to SDK on miss (returns first page only).
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

    // SDK: fetch the first verse of the juz to determine the starting page.
    // perPage=1 keeps this lightweight.
    const verses = await this.sdkVersesByJuz(juzNumber);
    if (!verses.length) {
      throw new AppError(404, `No content found for juz ${juzNumber}`);
    }
    return [{ pageNumber: verses[0].pageNumber }];
  }

  // ---- Private SDK wrappers -----------------------------------------------
  // Isolated so 503 error handling is consistent and callers stay readable.

  private async sdkVersesByPage(
    pageNumber: number,
    includeWords: boolean,
  ): Promise<Verse[]> {
    try {
      return await this.client.content.v4.verses.byPage(pageNumber as PageNumber, {
        mushaf: this.mushafId,
        fields: { imageUrl: true },
        words: includeWords,
        perPage: 50,
      });
    } catch (err: unknown) {
      this.rethrowSdkError(err, `page ${pageNumber}`);
    }
  }

  private async sdkGetChapter(surahNumber: number): Promise<Chapter> {
    try {
      return await this.client.content.v4.chapters.get(surahNumber as ChapterId);
    } catch (err: unknown) {
      this.rethrowSdkError(err, `surah ${surahNumber}`);
    }
  }

  private async sdkVersesByJuz(juzNumber: number): Promise<Verse[]> {
    try {
      return await this.client.content.v4.verses.byJuz(juzNumber as JuzNumber, {
        mushaf: this.mushafId,
        perPage: 1,
      });
    } catch (err: unknown) {
      this.rethrowSdkError(err, `juz ${juzNumber}`);
    }
  }

  // Converts SDK errors to AppErrors. The SDK throws plain Error objects
  // with HTTP status codes embedded in the message (e.g. "404 Not Found").
  private rethrowSdkError(err: unknown, context: string): never {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('404')) {
      throw new AppError(404, `Quran content not found: ${context}`);
    }
    throw new AppError(503, `Quran content provider error for ${context}: ${msg}`);
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
          const verses = (payload?.verses ?? []) as Array<Record<string, unknown>>;
          return verses.flatMap((v) =>
            ((v.words ?? []) as Array<Record<string, unknown>>).map(this.normalizeWord),
          );
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
    const sdkVerses = await this.sdkVersesByPage(pageNumber, includeWords);

    if (!sdkVerses?.length) {
      throw new AppError(404, `No content found for Quran page ${pageNumber}`);
    }

    // image_url is the same for all verses on a page — take it from the first.
    const imageUrl = sdkVerses[0]?.imageUrl ?? null;

    // Upsert quran_pages, populating image_url when the SDK provides it.
    const upsertPageData: Record<string, unknown> = {
      provider: 'quran_foundation',
      provider_mushaf_id: this.mushafId,
      mushaf_id: 'qcf_v2',
      page_number: pageNumber,
    };
    if (imageUrl) {
      upsertPageData.image_url = imageUrl;
    }

    const { data: pageRow, error: pageError } = await supabaseAdmin
      .from('quran_pages')
      .upsert(upsertPageData, { onConflict: 'provider,provider_mushaf_id,page_number' })
      .select('id, page_number, mushaf_id, image_url')
      .single();

    if (pageError) {
      throw new AppError(500, `Failed to cache page ${pageNumber}`);
    }

    // Group verses by surah and upsert one quran_page_mappings row per surah.
    const surahGroups = this.groupVersesBySurah(sdkVerses);
    const mappings: PageSurahMapping[] = [];

    for (const [surahNumStr, surahVerses] of Object.entries(surahGroups)) {
      const surahNum = parseInt(surahNumStr, 10);
      const firstVerse = surahVerses[0];
      const lastVerse = surahVerses[surahVerses.length - 1];

      // Strip word data from the stored payload when includeWords=false
      // to avoid storing large payloads with no words during summary fetches.
      const payloadVerses = includeWords
        ? surahVerses.map(this.serializeVerse)
        : surahVerses.map(({ words: _w, ...rest }) => this.serializeVerse(rest as Verse));

      await supabaseAdmin
        .from('quran_page_mappings')
        .upsert(
          {
            quran_page_id: pageRow.id,
            provider: 'quran_foundation',
            provider_mushaf_id: this.mushafId,
            page_number: pageNumber,
            surah_number: surahNum,
            juz_number: firstVerse.juzNumber,
            starts_at_ayah: parseInt(firstVerse.verseKey.split(':')[1], 10),
            ends_at_ayah: parseInt(lastVerse.verseKey.split(':')[1], 10),
            first_verse_key: firstVerse.verseKey,
            last_verse_key: lastVerse.verseKey,
            first_verse_id: firstVerse.id,
            last_verse_id: lastVerse.id,
            verses_count: surahVerses.length,
            source_payload: { verses: payloadVerses },
          },
          { onConflict: 'quran_page_id,surah_number' },
        );

      mappings.push({
        surahNumber: surahNum,
        juzNumber: firstVerse.juzNumber,
        firstVerseKey: firstVerse.verseKey,
        lastVerseKey: lastVerse.verseKey,
        startsAtAyah: parseInt(firstVerse.verseKey.split(':')[1], 10),
        endsAtAyah: parseInt(lastVerse.verseKey.split(':')[1], 10),
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
        ? { words: sdkVerses.flatMap((v) => (v.words ?? []).map(this.normalizeWord)) }
        : {}),
    };
  }

  // Groups a flat array of SDK verses into { surahNumber: Verse[] }.
  private groupVersesBySurah(verses: Verse[]): Record<string, Verse[]> {
    return verses.reduce<Record<string, Verse[]>>((acc, verse) => {
      const surahNum = verse.verseKey.split(':')[0];
      (acc[surahNum] ??= []).push(verse);
      return acc;
    }, {});
  }

  // Converts an SDK Verse to a plain object for storage in source_payload.
  // Keeps words as normalized QfWord objects to ensure consistent re-hydration.
  private serializeVerse(verse: Verse): Record<string, unknown> {
    return {
      id: verse.id,
      verseKey: verse.verseKey,
      pageNumber: verse.pageNumber,
      juzNumber: verse.juzNumber,
      ...(verse.words ? { words: verse.words.map(this.normalizeWord) } : {}),
    };
  }

  // Converts an SDK Word (or cached word object) to our stable QfWord shape.
  private normalizeWord = (w: Word | Record<string, unknown>): QfWord => {
    // Handles both live SDK Word objects and records re-hydrated from JSONB.
    const word = w as Record<string, unknown>;
    return {
      id: (word.id as number) ?? 0,
      position: word.position as number,
      text: (word.text as string) ?? (word.textUthmani as string) ?? '',
      lineNumber: word.lineNumber as number | undefined,
      pageNumber: word.pageNumber as number | undefined,
      charTypeName: word.charTypeName as string | undefined,
    };
  };
}

export const quranContentService = new QuranContentService();
