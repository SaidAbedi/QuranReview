import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  message?: string;
  onRetry?: () => void;
}

export function ErrorScreen({ message = 'Something went wrong.', onRetry }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>⚠️</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 24,
    gap: 12,
  },
  emoji: { fontSize: 40 },
  message: {
    color: '#374151',
    fontSize: 16,
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#1B4F72',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
