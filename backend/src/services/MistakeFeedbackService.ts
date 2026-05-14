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
    throw new AppError(501, 'Not implemented');
  }
}

export const mistakeFeedbackService = new MistakeFeedbackService();
