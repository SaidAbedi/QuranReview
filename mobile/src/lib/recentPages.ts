import AsyncStorage from '@react-native-async-storage/async-storage';

// Tracks the pages a student has recently opened in the Quran browser so the
// "Recently Read" strip can surface quick re-entry points. Persisted locally
// only — this is a convenience feature, not synced state.

const KEY = 'recent_pages';
const MAX = 8;

export async function getRecentPages(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

export async function pushRecentPage(page: number): Promise<void> {
  try {
    const current = await getRecentPages();
    // Move to front, dedupe, cap length.
    const next = [page, ...current.filter((p) => p !== page)].slice(0, MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // best-effort — ignore storage failures
  }
}
