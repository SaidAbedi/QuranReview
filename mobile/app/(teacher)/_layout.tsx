import { Stack } from 'expo-router';

export default function TeacherLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1B4F72' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="queue" options={{ title: 'Review Queue', headerShown: true }} />
      <Stack.Screen name="review/[submissionId]" options={{ title: 'Review', headerShown: true }} />
    </Stack>
  );
}
