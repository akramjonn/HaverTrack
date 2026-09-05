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

export default function SignUpScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      if (await signInWithGoogle()) router.replace('/');
    } catch (err) { setError(describeAuthError(err as Error).message); }
    finally { setGoogleLoading(false); }
  };

  const handleSignUp = async () => {
    setError(null);

    const address = email.trim().toLowerCase();
    if (!fullName.trim() || !address || !password) {
      setError('Please fill in all fields.');
      return;
    }

    if (!isCollegeEmail(address)) {
      setError('Registration is limited to @haverford.edu email addresses.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: address,
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });

      if (signUpError) {
        setError(describeAuthError(signUpError).message);
        return;
      }

      if (!data.session) {
        setConfirmationEmail(address);
        return;
      }
      await requireHaverfordUser();
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
          {/* Top Bar with Back Button */}
          <View style={styles.topBar}>
            <IconButton
              icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
              onPress={() => router.back()}
              accessibilityLabel="Go back"
            />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={Typography.displayL}>Create your account</Text>
            <Text style={[Typography.body, { color: Colors.textMuted, marginTop: 8 }]}>
              For Haverford students. Use your @haverford.edu Google account or register with email.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {confirmationEmail ? <View style={{ gap: 16 }}>
              <Text style={Typography.displayL}>Check your email</Text>
              <Text style={Typography.body}>Open the confirmation link sent to {confirmationEmail} on this device, then sign in. Check your spam folder too.</Text>
              <Button label="Go to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
              <Button label="Use a different email" variant="ghost" onPress={() => setConfirmationEmail(null)} />
            </View> : <>
            <Button label="Continue with Google" variant="outline" onPress={handleGoogle}
              loading={googleLoading} disabled={loading} />
            <Text style={[Typography.micro, { textAlign: 'center', marginVertical: 20 }]}>OR REGISTER WITH EMAIL</Text>
            <Input
              label="FULL NAME"
              placeholder="Alex Rivera"
              value={fullName}
              onChangeText={(t) => {
                setFullName(t);
                setError(null);
              }}
              autoCapitalize="words"
            />

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
              autoCorrect={false}
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

            <Button
              label="Create account with email"
              variant="primary"
              onPress={handleSignUp}
              loading={loading}
              disabled={googleLoading}
              style={{ marginTop: 8 }}
            />

            <Button
              label="Already have an account? Sign in"
              variant="ghost"
              onPress={() => router.replace('/(auth)/sign-in' as any)}
            />
            </>}
          </View>

          {/*
            Apple sign-in is intentionally absent until it is real — that needs
            expo-apple-authentication plus supabase.auth.signInWithIdToken, and a
            button that fakes a session is worse than no button.
          */}

          {/* Terms Footer */}
          <View style={styles.footer}>
            <Text style={styles.termsText}>
              By continuing you agree to the Terms and Privacy Policy.
            </Text>
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
  termsText: {
    ...Typography.micro,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
