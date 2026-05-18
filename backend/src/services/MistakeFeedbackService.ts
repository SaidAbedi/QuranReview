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
}

export const mistakeFeedbackService = new MistakeFeedbackService();
