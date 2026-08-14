import { Alert, Text, TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { Bell, BookOpen, ChartLineUp, ClockCounterClockwise, Scroll } from 'phosphor-react-native';
import { supabase } from '@/lib/supabase';
import { secureStorage } from '@/lib/secureStorage';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { useTheme } from '@/hooks/useTheme';

function SignOutButton({ color }: { color: string }) {
  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            // Clear secure storage and auth session in parallel
            await Promise.all([
              secureStorage.clearRefreshToken(),
              supabase.auth.signOut(),
            ]);
          } catch (error) {
            console.error('Sign out error:', error);
            // Still signed out from Supabase side, but log the error
          }
        },
      },
    ]);
  };
  return (
    <TouchableOpacity onPress={handleSignOut} style={{ marginRight: 16 }}>
      <Text style={{ color, fontSize: 14, fontWeight: '600' }}>Sign Out</Text>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  const { unreadCount } = useUnreadCount();
  const theme = useTheme();
  const T = theme.colors;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: T.headerBg },
        headerTintColor: T.headerText,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: T.tabActive,
        tabBarInactiveTintColor: T.tabInactive,
        tabBarStyle: {
          backgroundColor: T.tabBackground,
          borderTopColor: T.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Read',
          headerRight: () => <SignOutButton color={T.headerText} />,
          tabBarIcon: ({ color, focused }) => (
            <BookOpen size={24} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="quran"
        options={{
          title: 'Quran',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Scroll size={24} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <ChartLineUp size={24} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, focused }) => (
            <ClockCounterClockwise size={24} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          href: null,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Bell size={24} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
    </Tabs>
  );
}
