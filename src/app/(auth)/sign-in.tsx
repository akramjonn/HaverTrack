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
import { Button, Input, IconButton } from '@/components/ui';
import { ArrowLeft } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { describeAuthError } from '@/lib/authErrors';

export default function SignInScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        const failure = describeAuthError(signInError);
        if (failure.needsConfirmation) {
          router.push({
            pathname: '/(auth)/verify-email',
            params: { mode: 'confirm', email: email.trim().toLowerCase() },
          } as any);
          return;
        }
        setError(failure.message);
        return;
      }

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
              Sign in to your SquirrelTrack account.
            </Text>
          </View>

          <View style={styles.form}>
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

            <Button
              label="Sign In"
              variant="primary"
              onPress={handleSignIn}
              loading={loading}
              style={{ marginTop: 8 }}
            />

            <Button
              label="Forgot password?"
              variant="ghost"
              onPress={() =>
                router.push({
                  pathname: '/(auth)/forgot-password',
                  params: { email: email.trim().toLowerCase() },
                } as any)
              }
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
