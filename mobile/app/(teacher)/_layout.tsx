import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

export default function TeacherLayout() {
  const theme = useTheme();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="review/[submissionId]"
        options={{
          headerShown: true,
          title: 'Review',
          headerStyle: { backgroundColor: theme.colors.headerBg },
          headerTintColor: theme.colors.headerText,
          headerTitleStyle: { fontWeight: '700' },
        }}
      />
    </Stack>
  );
}
