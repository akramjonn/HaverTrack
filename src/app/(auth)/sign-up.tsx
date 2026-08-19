import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography } from '@/constants/theme';
import { Button, Input, IconButton, GoogleIcon } from '@/components/ui';
import { ArrowLeft } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { describeAuthError, isCollegeEmail } from '@/lib/authErrors';
import { useGoogleSignIn } from '@/hooks/use-google-sign-in';

export default function SignUpScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    signIn: handleGoogleSignUp,
    isLoading: googleLoading,
    error: googleError,
  } = useGoogleSignIn();

  const handleSignUp = async () => {
    setError(null);

    const address = email.trim().toLowerCase();
    if (!fullName.trim() || !address || !password) {
      setError('Please fill in all fields.');
      return;
    }

    if (!address.includes('@')) {
      setError('Enter a valid email address.');
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
        options: { data: { full_name: fullName.trim() } },
      });

      if (signUpError) {
        setError(describeAuthError(signUpError).message);
        return;
      }

      // With email confirmation on, signUp returns a user but no session. The
      // account is not usable until the code is entered.
      if (!data.session) {
        router.push({
          pathname: '/(auth)/verify-email',
          params: { mode: 'confirm', email: address },
        } as any);
        return;
      }

      if (!isCollegeEmail(address)) {
        router.push({ pathname: '/(auth)/verify-email', params: { mode: 'college' } } as any);
        return;
      }

      router.replace('/(onboarding)/goal' as any);
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
              Use your Haverford email to unlock DC menus.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
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
              label="Continue"
              variant="primary"
              onPress={handleSignUp}
              loading={loading}
              style={{ marginTop: 8 }}
            />

            <Button
              label="Already have an account? Sign in"
              variant="ghost"
              onPress={() => router.replace('/(auth)/sign-in' as any)}
            />
          </View>

          {/*
            Apple sign-in is intentionally absent until it is real — that needs
            expo-apple-authentication plus supabase.auth.signInWithIdToken, and a
            button that fakes a session is worse than no button.
          */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            label="Continue with Google"
            variant="google"
            icon={<GoogleIcon />}
            onPress={handleGoogleSignUp}
            loading={googleLoading}
          />

          {googleError ? <Text style={styles.googleError}>{googleError}</Text> : null}

          <Text style={styles.googleHint}>
            Uses your @haverford.edu Google account — one tap, no password.
          </Text>

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
  googleError: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.scarletBright,
    marginTop: 12,
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.borderSoft,
  },
  dividerText: {
    ...Typography.monoLabel,
    marginHorizontal: 16,
  },
  googleHint: {
    ...Typography.micro,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 10,
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
