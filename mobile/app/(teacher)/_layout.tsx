import { Stack } from 'expo-router';

export default function TeacherLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="review/[submissionId]"
        options={{
          headerShown: true,
          title: 'Review',
          headerStyle: { backgroundColor: '#1B4F72' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      />
    </Stack>
  );
}
