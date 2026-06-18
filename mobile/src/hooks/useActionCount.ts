import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getStudentAssignments } from '@/api/assignments';

const ACTION_STATUSES = new Set(['needs_resubmission', 'reviewed']);

export function useActionCount() {
  const [actionCount, setActionCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const assignments = await getStudentAssignments();
      setActionCount(assignments.filter((a) => ACTION_STATUSES.has(a.status)).length);
    } catch {
      // best-effort — badge silently stays at last known count
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { actionCount, refresh };
}
