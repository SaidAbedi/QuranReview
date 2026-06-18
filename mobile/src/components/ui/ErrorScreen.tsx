import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  message?: string;
  onRetry?: () => void;
}

export function ErrorScreen({ message = 'Something went wrong.', onRetry }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={styles.emoji}>⚠️</Text>
      <Text style={[styles.message, { color: theme.colors.textSecondary }]}>{message}</Text>
      {onRetry && (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.colors.brandPrimary }]}
          onPress={onRetry}
        >
          <Text style={[styles.buttonText, { color: theme.colors.brandOnPrimary }]}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emoji:     { fontSize: 40 },
  message:   { fontSize: 16, textAlign: 'center' },
  button:    { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  buttonText:{ fontSize: 15, fontWeight: '600' },
});
