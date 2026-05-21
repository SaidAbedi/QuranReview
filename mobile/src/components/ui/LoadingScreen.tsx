import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface Props {
  message?: string;
}

export function LoadingScreen({ message = 'Loading…' }: Props) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1B4F72" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    gap: 12,
  },
  text: {
    color: '#6B7280',
    fontSize: 15,
  },
});
