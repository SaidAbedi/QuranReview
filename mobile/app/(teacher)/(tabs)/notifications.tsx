import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/api/notifications';
import { C } from '@/constants/colors';
import type { NotificationRow } from '@/types/api';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

const TYPE_ICONS: Record<string, string> = {
  student_submitted_attempt:     '📩',
  teacher_completed_review:      '✅',
  teacher_requested_resubmission:'🔁',
  voice_note_added:              '🎙',
  admin_assigned_teacher:        '👤',
  student_assigned_to_teacher:   '👤',
  attempt_comment_added:         '💬',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function NotificationItem({ item, onPress }: { item: NotificationRow; onPress: () => void }) {
  const icon = TYPE_ICONS[item.type] ?? '🔔';
  const isUnread = !item.readAt;

  return (
    <TouchableOpacity
      style={[styles.item, isUnread && styles.itemUnread]}
      onPress={onPress}
      activeOpacity={isUnread ? 0.7 : 1}
    >
      <View style={[styles.iconWrap, isUnread && styles.iconWrapUnread]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.itemContent}>
        <Text style={[styles.itemTitle, isUnread && styles.itemTitleUnread]}>{item.title}</Text>
        {item.body ? <Text style={styles.itemBody} numberOfLines={2}>{item.body}</Text> : null}
        <Text style={styles.itemTime}>{relativeTime(item.createdAt)}</Text>
      </View>
      {isUnread && <View style={styles.dot} />}
    </TouchableOpacity>
  );
}

export default function TeacherNotificationsScreen() {
  const [items, setItems]             = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const result = await getNotifications({ limit: 50 });
      setItems(result.items);
      setUnreadCount(result.unreadCount);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: now } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch { /* best-effort */ }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })));
      setUnreadCount(0);
    } catch { /* best-effort */ }
  };

  if (loading) return <LoadingScreen message="Loading notifications…" />;
  if (error)   return <ErrorScreen message={error} onRetry={() => load()} />;

  return (
    <View style={styles.container}>
      {unreadCount > 0 && (
        <View style={styles.toolbar}>
          <Text style={styles.toolbarCount}>{unreadCount} unread</Text>
          <TouchableOpacity onPress={handleMarkAllRead} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.markAllBtn}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.blue} />
        }
        contentContainerStyle={items.length === 0 ? styles.emptyWrap : styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptyBody}>No notifications yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <NotificationItem
            item={item}
            onPress={() => { if (!item.readAt) handleMarkRead(item.id); }}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },

  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  toolbarCount: { fontSize: 13, color: C.textMuted, fontWeight: '500' },
  markAllBtn:   { fontSize: 13, color: C.blue, fontWeight: '700' },

  list:     { paddingVertical: 8 },
  emptyWrap:{ flex: 1 },
  separator:{ height: StyleSheet.hairlineWidth, backgroundColor: C.divider, marginLeft: 66 },

  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.white,
    gap: 12,
  },
  itemUnread: { backgroundColor: C.blueBg },

  iconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.grayBg,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  iconWrapUnread: { backgroundColor: '#DBEAFE' },
  icon: { fontSize: 18 },

  itemContent:     { flex: 1, gap: 2 },
  itemTitle:       { fontSize: 14, fontWeight: '600', color: C.text, lineHeight: 20 },
  itemTitleUnread: { color: C.blue },
  itemBody:        { fontSize: 13, color: C.textMuted, lineHeight: 18 },
  itemTime:        { fontSize: 11, color: C.grayLight, marginTop: 2 },

  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.blue,
    marginTop: 6, flexShrink: 0,
  },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 6 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  emptyBody:  { fontSize: 14, color: C.textMuted },
});
