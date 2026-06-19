import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/api/notifications';
import type { NotificationRow } from '@/types/api';
import { useTheme } from '@/hooks/useTheme';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function NotificationItem({
  item,
  onRead,
}: {
  item: NotificationRow;
  onRead: (id: string) => void;
}) {
  const theme = useTheme();
  const T = theme.colors;
  const isUnread = !item.readAt;

  return (
    <TouchableOpacity
      style={[
        s.item,
        { backgroundColor: isUnread ? T.surface : T.backgroundAlt, borderColor: T.border },
      ]}
      onPress={() => { if (isUnread) onRead(item.id); }}
      activeOpacity={0.75}
    >
      {isUnread && <View style={[s.unreadDot, { backgroundColor: T.brandPrimary }]} />}
      <View style={s.itemBody}>
        <View style={s.itemTop}>
          <Text
            style={[s.itemTitle, { color: T.textPrimary }, isUnread && s.bold]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={[s.itemTime, { color: T.textMuted }]}>{timeAgo(item.createdAt)}</Text>
        </View>
        {!!item.body && (
          <Text style={[s.itemBodyText, { color: T.textSecondary }]} numberOfLines={2}>
            {item.body}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const T = theme.colors;

  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const result = await getNotifications({ limit: 50 });
      setItems(result.items);
      setUnreadCount(result.unreadCount);
    } catch { /* stale data is fine */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleRead = async (id: string) => {
    setItems((prev) =>
      prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try { await markNotificationRead(id); } catch { /* best effort */ }
  };

  const handleMarkAllRead = async () => {
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
    try { await markAllNotificationsRead(); } catch { /* best effort */ }
  };

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: T.backgroundAlt }]}>
        <Text style={[s.loadingText, { color: T.textMuted }]}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[s.container, { backgroundColor: T.backgroundAlt }]}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={T.brandPrimary}
        />
      }
    >
      <View style={s.headerRow}>
        <Text style={[s.sectionLabel, { color: T.textMuted }]}>
          {unreadCount > 0 ? `${unreadCount} UNREAD` : 'NOTIFICATIONS'}
        </Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} activeOpacity={0.7}>
            <Text style={[s.markAll, { color: T.brandPrimary }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 ? (
        <View style={[s.empty, { backgroundColor: T.surface }]}>
          <Text style={[s.emptyTitle, { color: T.textPrimary }]}>No notifications yet</Text>
          <Text style={[s.emptyBody, { color: T.textMuted }]}>
            Your teacher will send you updates here when they review your recitations.
          </Text>
        </View>
      ) : (
        <View style={s.list}>
          {items.map((item) => (
            <NotificationItem key={item.id} item={item} onRead={handleRead} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1 },
  content:     { padding: 16, paddingBottom: 32 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  markAll:      { fontSize: 13, fontWeight: '600' },

  list: { gap: 8 },

  item: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  itemBody:    { flex: 1, gap: 4 },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle:    { fontSize: 14, flex: 1 },
  bold:         { fontWeight: '600' },
  itemTime:     { fontSize: 11, flexShrink: 0 },
  itemBodyText: { fontSize: 13, lineHeight: 18 },

  empty: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody:  { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
