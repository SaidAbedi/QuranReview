import { Alert, Text, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';

function SignOutButton() {
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  return (
    <TouchableOpacity onPress={handleSignOut} style={{ marginRight: 16 }}>
      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Sign Out</Text>
    </TouchableOpacity>
  );
}

export default function TeacherLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1B4F72' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen
        name="queue"
        options={{ title: 'Review Queue', headerShown: true, headerRight: () => <SignOutButton /> }}
      />
      <Stack.Screen name="review/[submissionId]" options={{ title: 'Review', headerShown: true }} />
    </Stack>
  );
}
