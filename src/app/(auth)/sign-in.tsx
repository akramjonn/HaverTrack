import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography } from '@/constants/theme';
import { Button, Input, IconButton } from '@/components/ui';
import { ArrowLeft } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { describeAuthError, isCollegeEmail } from '@/lib/authErrors';
import { getAuthRedirectUrl, requireHaverfordUser, signInWithGoogle } from '@/lib/auth';

export default function SignInScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      if (await signInWithGoogle()) router.replace('/');
    } catch (err) {
      setError(describeAuthError(err as Error).message);
    } finally { setGoogleLoading(false); }
  };

  const resendConfirmation = async () => {
    if (!isCollegeEmail(email)) return;
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup', email: email.trim().toLowerCase(),
        options: { emailRedirectTo: getAuthRedirectUrl() },
      });
      if (error) throw error;
      setNotice('Confirmation link sent. Check your Haverford inbox and spam folder.');
    } catch (err) { setError(describeAuthError(err as Error).message); }
    finally { setLoading(false); }
  };

  const handleSignIn = async () => {
    setError(null);
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (!isCollegeEmail(email)) {
      setError('Use your @haverford.edu email to sign in.');
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        setNeedsConfirmation(signInError.code === 'email_not_confirmed');
        setError(describeAuthError(signInError).message);
        return;
      }
      await requireHaverfordUser();

      // The root layout redirects once the session lands, so onboarding state is
      // resolved in one place instead of being guessed here.
      router.replace('/' as any);
    } catch (err: any) {
      setError(describeAuthError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.topBar}>
            <IconButton
              icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
              onPress={() => router.back()}
              accessibilityLabel="Go back"
            />
          </View>

          <View style={styles.header}>
            <Text style={Typography.displayL}>Welcome back</Text>
            <Text style={[Typography.body, { color: Colors.textMuted, marginTop: 8 }]}>
              Sign in to your HaverTrack account.
            </Text>
          </View>

          <View style={styles.form}>
            <Button label="Continue with Google" variant="outline" onPress={handleGoogle}
              loading={googleLoading} disabled={loading} />
            <Text style={[Typography.micro, { textAlign: 'center', marginVertical: 20 }]}>OR SIGN IN WITH EMAIL</Text>
            <Input
              label="HAVERFORD EMAIL"
              placeholder="username@haverford.edu"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
              }}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Input
              label="PASSWORD"
              placeholder="••••••••"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
              secureTextEntry
            />

            {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
            {notice ? <Text style={Typography.body}>{notice}</Text> : null}
            {needsConfirmation ? <Button label="Resend confirmation email" variant="ghost"
              onPress={resendConfirmation} disabled={loading || googleLoading} /> : null}

            <Button
              label="Sign In"
              variant="primary"
              onPress={handleSignIn}
              loading={loading}
              disabled={googleLoading}
              style={{ marginTop: 8 }}
            />

          </View>

          <View style={styles.footer}>
            <Button
              label="Don't have an account? Sign up"
              variant="ghost"
              onPress={() => router.replace('/(auth)/sign-up' as any)}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  topBar: {
    marginBottom: 24,
  },
  header: {
    marginBottom: 32,
  },
  form: {
    width: '100%',
  },
  errorBanner: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.scarletBright,
    marginBottom: 12,
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
});
