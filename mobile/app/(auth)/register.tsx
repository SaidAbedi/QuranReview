import { useState } from 'react';
import {
  Alert,
  Image,
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

export default function RegisterScreen() {
  const theme = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [loading, setLoading]         = useState(false);

  async function handleRegister() {
    if (!displayName || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const authRedirectUrl =
      process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL ??
      process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/api$/, '/auth/callback');

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName.trim() },
        emailRedirectTo: authRedirectUrl,
      },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Sign-up failed', error.message);
    } else {
      Alert.alert('Check your email', 'We sent a confirmation link. Click it to activate your account.');
    }
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
          <Image
            source={require('../../assets/logo-dark.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={[styles.subtitle, { color: T.textMuted }]}>Create your account</Text>
        </View>

        <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
          <Text style={[styles.label, { color: T.textSecondary }]}>Display name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: T.inputBackground, borderColor: T.inputBorder, color: T.textPrimary }]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={T.inputPlaceholder}
            autoCapitalize="words"
          />

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
            placeholder="Minimum 6 characters"
            placeholderTextColor={T.inputPlaceholder}
            secureTextEntry
          />

          <Button
            title="Create Account"
            onPress={handleRegister}
            loading={loading}
            disabled={loading}
            style={styles.button}
          />
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: T.textMuted }]}>Already have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={[styles.link, { color: T.brandPrimary }]}>Sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View style={styles.bottomFooter}>
          <Text style={[styles.bottomFooterText, { color: T.textMuted }]}>Quran Institute of Dallas</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 32 },
  header:    { alignItems: 'center', marginBottom: 32 },
  logo:      { width: 160, height: 160 },
  subtitle:  { fontSize: 15, marginTop: 4 },
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
  button:     { marginTop: 8 },
  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { fontSize: 15 },
  link:       { fontSize: 15, fontWeight: '600' },
  bottomFooter: { alignItems: 'center', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e5e5e5' },
  bottomFooterText: { fontSize: 12 },
});
