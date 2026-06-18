import { Alert, Text, TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useActionCount } from '@/hooks/useActionCount';
import { useTheme } from '@/hooks/useTheme';

function SignOutButton({ color }: { color: string }) {
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };
  return (
    <TouchableOpacity onPress={handleSignOut} style={{ marginRight: 16 }}>
      <Text style={{ color, fontSize: 14, fontWeight: '600' }}>Sign Out</Text>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  const { actionCount } = useActionCount();
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.headerBg },
        headerTintColor: theme.colors.headerText,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: theme.colors.tabActive,
        tabBarInactiveTintColor: theme.colors.tabInactive,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBackground,
          borderTopColor: theme.colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Assignments',
          tabBarBadge: actionCount > 0 ? actionCount : undefined,
          headerRight: () => <SignOutButton color={theme.colors.headerText} />,
        }}
      />
      <Tabs.Screen name="quran" options={{ title: 'Quran', headerShown: false }} />
      <Tabs.Screen name="progress" options={{ headerShown: false }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}
