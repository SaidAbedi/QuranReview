import { api } from './client';
import type { MeResponse } from '@/types/api';

export const fetchMe = () => api.get<MeResponse>('/me');

export const updateProfile = (body: {
  displayName?: string;
  preferredLanguage?: string;
  timezone?: string;
}) => api.patch<MeResponse>('/me/profile', body);
