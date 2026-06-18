import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { fetchMe } from '@/api/me';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/hooks/useTheme';

export default function PendingScreen() {
  const { setUser } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const theme = useTheme();
  const T = theme.colors;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const me = await fetchMe();
      setUser(me);
      // Root layout will re-route automatically if status changed.
    } catch {
      Alert.alert('Error', 'Could not refresh account status. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // Root layout handles redirect to login on session cleared.
  };

  return (
    <View style={[styles.container, { backgroundColor: T.backgroundAlt }]}>
      <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
        <Text style={[styles.title, { color: T.brandPrimary }]}>Account Pending</Text>
        <Text style={[styles.body, { color: T.textMuted }]}>
          Your account is being set up. An admin will assign you to a teacher shortly.
          {'\n\n'}
          Check back soon or tap Refresh to update your status.
        </Text>
        <Button
          title="Refresh Status"
          onPress={handleRefresh}
          loading={refreshing}
          disabled={refreshing}
          style={styles.button}
        />
        <Button
          title="Sign Out"
          variant="secondary"
          onPress={handleSignOut}
          style={styles.button}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  button: { width: '100%', marginTop: 8 },
});
