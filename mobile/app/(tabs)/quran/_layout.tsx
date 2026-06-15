import { Stack } from 'expo-router';

export default function QuranLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1B4F72' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Quran' }} />
      <Stack.Screen name="[pageNumber]" options={{ title: 'Page' }} />
    </Stack>
  );
}
