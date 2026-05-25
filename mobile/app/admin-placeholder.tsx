import { StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';

export default function AdminPlaceholderScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Admin Dashboard</Text>
        <Text style={styles.body}>
          The admin mobile interface is not available in this version.
          {'\n\n'}
          Admin functions (assigning teachers, managing users) are handled via the Supabase dashboard or a future web interface.
        </Text>
        <Button
          title="Sign Out"
          variant="secondary"
          onPress={() => supabase.auth.signOut()}
          style={styles.btn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1B4F72',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  btn: { marginTop: 8 },
});
