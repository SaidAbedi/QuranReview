import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/hooks/useTheme';

export default function LoginScreen() {
  const theme = useTheme();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) Alert.alert('Sign-in failed', error.message);
  }

  const T = theme.colors;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: T.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: T.brandPrimary }]}>QuranReview</Text>
          <Text style={[styles.subtitle, { color: T.textMuted }]}>Sign in to continue</Text>
        </View>

        <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
          <Text style={[styles.label, { color: T.textSecondary }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: T.inputBackground, borderColor: T.inputBorder, color: T.textPrimary }]}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={T.inputPlaceholder}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.label, { color: T.textSecondary }]}>Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: T.inputBackground, borderColor: T.inputBorder, color: T.textPrimary }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={T.inputPlaceholder}
            secureTextEntry
          />

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.button}
          />
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: T.textMuted }]}>Don't have an account? </Text>
          <Link href="/(auth)/register" asChild>
            <TouchableOpacity>
              <Text style={[styles.link, { color: T.brandPrimary }]}>Sign up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header:    { alignItems: 'center', marginBottom: 32 },
  title:     { fontSize: 32, fontWeight: '700' },
  subtitle:  { fontSize: 16, marginTop: 6 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 8,
    marginBottom: 8,
  },
  label:  { fontSize: 14, fontWeight: '600', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 50,
  },
  button: { marginTop: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { fontSize: 15 },
  link: { fontSize: 15, fontWeight: '600' },
});
