import { Request } from 'express';

// ---- Domain types --------------------------------------------------------

export type UserRole = 'student' | 'teacher' | 'admin' | 'super_admin';

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'reviewed'
  | 'needs_resubmission'
  | 'completed';

export type AttemptStatus =
  | 'submitted'
  | 'in_review'
  | 'reviewed'
  | 'needs_resubmission'
  | 'completed'
  | 'archived';

export type AnnotationType =
  | 'freehand' | 'circle' | 'underline' | 'highlight'
  | 'note' | 'word_marker' | 'ayah_marker';
export type AnchorType = 'page_region' | 'word' | 'ayah' | 'line';
export type MistakeType =
  | 'tajweed' | 'harakat' | 'wrong_word' | 'wrong_ayah'
  | 'makhraj' | 'madd' | 'ghunnah' | 'waqf'
  | 'pronunciation' | 'memorization' | 'other';

export type NotificationType =
  | 'student_submitted_attempt'
  | 'teacher_completed_review'
  | 'teacher_requested_resubmission'
  | 'admin_assigned_teacher'
  | 'student_assigned_to_teacher'
  | 'relationship_deactivated'
  | 'relationship_reactivated'
  | 'voice_note_added'
  | 'attempt_comment_added';

export type AssignmentRequestStatus =
  | 'pending_assignment'
  | 'assigned'
  | 'waitlisted'
  | 'declined'
  | 'archived';

// ---- API error -----------------------------------------------------------

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ---- Profile types -------------------------------------------------------

export type OnboardingStatus = 'new' | 'pending_assignment' | 'active' | 'inactive';

export interface UserProfile {
  preferredLanguage: string | null;
  timezone: string | null;
  studentAgeGroup: string | null;
  teacherCapacity: number | null;
  teacherCurrentLoad: number;
  onboardingStatus: OnboardingStatus;
}

export interface MeResponse {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  profile: UserProfile;
}

// ---- Pagination ----------------------------------------------------------

export interface PaginationParams {
  limit: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
}

// ---- Express augmentation ------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      user?: AppUser;
    }
  }
}
