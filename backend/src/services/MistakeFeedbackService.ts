import { supabaseAdmin } from '../db/client';
import { AppError } from '../types';

export interface MistakeCategoryRow {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  options: MistakeOptionRow[];
}

export interface MistakeOptionRow {
  id: string;
  categoryId: string;
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
}

// Enriched option detail embedded in annotation responses.
export interface MistakeOptionDetail {
  id: string;
  code: string;
  label: string;
  categoryId: string;
  categoryCode: string;
  categoryLabel: string;
}

// Reads mistake categories and options from the database.
// Categories/options are never hardcoded in app code — always read from DB
// so labels can be updated without a code deploy.
export class MistakeFeedbackService {
  async getMistakeCategories(): Promise<MistakeCategoryRow[]> {
    const { data: categories, error: catErr } = await supabaseAdmin
      .from('mistake_categories')
      .select('id, code, label, description, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (catErr) throw new AppError(500, 'Failed to fetch mistake categories');
    if (!categories || categories.length === 0) return [];

    const categoryIds = categories.map((c) => (c as Record<string, unknown>).id as string);

    const { data: options, error: optErr } = await supabaseAdmin
      .from('mistake_options')
      .select('id, category_id, code, label, description, sort_order')
      .in('category_id', categoryIds)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (optErr) throw new AppError(500, 'Failed to fetch mistake options');

    const optionsByCategory = new Map<string, MistakeOptionRow[]>();
    for (const opt of options ?? []) {
      const o = opt as Record<string, unknown>;
      const catId = o.category_id as string;
      if (!optionsByCategory.has(catId)) optionsByCategory.set(catId, []);
      optionsByCategory.get(catId)!.push({
        id: o.id as string,
        categoryId: catId,
        code: o.code as string,
        label: o.label as string,
        description: (o.description as string | null) ?? null,
        sortOrder: o.sort_order as number,
      });
    }

    return categories.map((c) => {
      const row = c as Record<string, unknown>;
      const id = row.id as string;
      return {
        id,
        code: row.code as string,
        label: row.label as string,
        description: (row.description as string | null) ?? null,
        sortOrder: row.sort_order as number,
        options: optionsByCategory.get(id) ?? [],
      };
    });
  }

  // Fetches enriched option details for a set of option IDs.
  // Used by AnnotationService to embed option+category labels in annotation responses.
  async getMistakeOptionDetails(ids: string[]): Promise<Map<string, MistakeOptionDetail>> {
    if (ids.length === 0) return new Map();

    const { data, error } = await supabaseAdmin
      .from('mistake_options')
      .select('id, code, label, category_id, mistake_categories!category_id(id, code, label)')
      .in('id', ids)
      .eq('is_active', true);

    if (error || !data) return new Map();

    const map = new Map<string, MistakeOptionDetail>();
    for (const d of data) {
      const row = d as Record<string, unknown>;
      const cat = row.mistake_categories as Record<string, unknown> | null;
      map.set(row.id as string, {
        id: row.id as string,
        code: row.code as string,
        label: row.label as string,
        categoryId: row.category_id as string,
        categoryCode: (cat?.code as string) ?? '',
        categoryLabel: (cat?.label as string) ?? '',
      });
    }
    return map;
  }

  // Validates that the given option ID exists, is active, and (when mistakeType is
  // provided) belongs to the category whose code matches mistakeType.
  // Returns the enriched detail on success; throws AppError on failure.
  async validateAndGetOptionDetail(
    mistakeOptionId: string,
    mistakeType?: string,
  ): Promise<MistakeOptionDetail> {
    const map = await this.getMistakeOptionDetails([mistakeOptionId]);
    const detail = map.get(mistakeOptionId);

    if (!detail) throw new AppError(422, 'Mistake option not found or inactive');

    if (mistakeType && detail.categoryCode !== mistakeType) {
      throw new AppError(
        422,
        `Mistake option "${detail.code}" belongs to category "${detail.categoryCode}", not "${mistakeType}"`,
      );
    }

    return detail;
  }
}

export const mistakeFeedbackService = new MistakeFeedbackService();
