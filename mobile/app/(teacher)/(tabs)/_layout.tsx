import { Alert, Text, TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { Bell, Tray, Users } from 'phosphor-react-native';
import { supabase } from '@/lib/supabase';
import { useUnreadCount } from '@/hooks/useUnreadCount';
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

export default function TeacherTabsLayout() {
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
        name="queue"
        options={{
          title: 'Queue',
          headerRight: () => <SignOutButton color={T.headerText} />,
          tabBarIcon: ({ color, focused }) => (
            <Tray size={24} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="students"
        options={{
          title: 'Students',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Users size={24} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Bell size={24} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
    </Tabs>
  );
}
