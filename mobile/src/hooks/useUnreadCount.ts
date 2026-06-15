import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getNotifications } from '@/api/notifications';

export function useUnreadCount() {
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const result = await getNotifications({ unreadOnly: true, limit: 1 });
      setUnreadCount(result.unreadCount);
    } catch {
      // best-effort — badge silently stays at 0 if request fails
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { unreadCount, refresh };
}
