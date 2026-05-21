import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/api/notifications';
import type { NotificationRow } from '@/types/api';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // best-effort; ignore errors
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })));
      setUnreadCount(0);
    } catch {
      // best-effort; ignore errors
    }
  };

  if (loading) return <LoadingScreen message="Loading notifications…" />;
  if (error) return <ErrorScreen message={error} onRetry={() => load()} />;

  return (
    <View style={styles.container}>
      {unreadCount > 0 && (
        <View style={styles.toolbar}>
          <Text style={styles.toolbarText}>{unreadCount} unread</Text>
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(true);
            }}
          />
        }
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No notifications yet.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.item, !item.readAt && styles.unread]}
            onPress={() => {
              if (!item.readAt) handleMarkRead(item.id);
            }}
            activeOpacity={item.readAt ? 1 : 0.75}
          >
            <Text style={styles.itemTitle}>{item.title}</Text>
            {item.body ? <Text style={styles.itemBody}>{item.body}</Text> : null}
            <Text style={styles.itemTime}>
              {new Date(item.createdAt).toLocaleString()}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  toolbarText: { color: '#374151', fontSize: 14 },
  markAllText: { color: '#1B4F72', fontSize: 14, fontWeight: '600' },
  list: { padding: 12, gap: 8 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: { color: '#6B7280', fontSize: 15, textAlign: 'center' },
  item: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  unread: { borderLeftWidth: 3, borderLeftColor: '#1B4F72' },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 4 },
  itemBody: { fontSize: 14, color: '#6B7280', marginBottom: 4 },
  itemTime: { fontSize: 12, color: '#9CA3AF' },
});
