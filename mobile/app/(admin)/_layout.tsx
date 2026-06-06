import { Alert, Text, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
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

function RelationshipsButton() {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.push('/(admin)/relationships' as '/')}
      style={{ marginLeft: 16 }}
    >
      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Relationships</Text>
    </TouchableOpacity>
  );
}

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1B4F72' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Pending Requests',
          headerRight: () => <SignOutButton />,
          headerLeft: () => <RelationshipsButton />,
        }}
      />
      <Stack.Screen
        name="assign/[requestId]"
        options={{ title: 'Assign Teacher', headerShown: true }}
      />
      <Stack.Screen
        name="relationships"
        options={{ title: 'Teacher-Student Pairs', headerShown: true }}
      />
    </Stack>
  );
}
