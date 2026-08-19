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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Fonts, Typography } from '@/constants/theme';
import { Button, Input, IconButton } from '@/components/ui';
import { ArrowLeft, KeyRound } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { describeAuthError } from '@/lib/authErrors';

/**
 * Code-based reset rather than a magic link: deep links are unreliable in Expo Go
 * and a 6-digit code works the same on every platform.
 *
 * Requires the Supabase "Reset Password" email template to include {{ .Token }}.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(params.email ?? '');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    setError(null);
    const address = email.trim().toLowerCase();

    if (!address.includes('@')) {
      setError('Enter the email address on your account.');
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(address);
      if (resetError) {
        setError(describeAuthError(resetError).message);
        return;
      }
      setStep('reset');
    } catch (err: any) {
      setError(describeAuthError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError(null);

    if (otpCode.trim().length < 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Use a new password of at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      // Verifying the recovery code signs the user in, which is what makes the
      // password update below possible.
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otpCode.trim(),
        type: 'recovery',
      });

      if (verifyError) {
        setError(describeAuthError(verifyError).message);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(describeAuthError(updateError).message);
        return;
      }

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

          <View style={styles.iconCircle}>
            <KeyRound size={26} color={Colors.scarlet} />
          </View>

          <View style={styles.header}>
            <Text style={Typography.displayL}>Reset password</Text>
            <Text style={[Typography.body, { color: Colors.textMuted, marginTop: 8 }]}>
              {step === 'request'
                ? 'We will email you a 6-digit code to set a new password.'
                : `Enter the code sent to ${email} and choose a new password.`}
            </Text>
          </View>

          {step === 'request' ? (
            <View style={styles.form}>
              <Input
                label="EMAIL"
                placeholder="username@haverford.edu"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  setError(null);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

              <Button
                label="Send reset code"
                variant="primary"
                onPress={handleSendCode}
                loading={loading}
                style={{ marginTop: 12 }}
              />
            </View>
          ) : (
            <View style={styles.form}>
              <Input
                label="6-DIGIT CODE"
                placeholder="123456"
                value={otpCode}
                onChangeText={(t) => {
                  setOtpCode(t);
                  setError(null);
                }}
                keyboardType="number-pad"
                maxLength={6}
              />

              <Input
                label="NEW PASSWORD"
                placeholder="••••••••"
                value={newPassword}
                onChangeText={(t) => {
                  setNewPassword(t);
                  setError(null);
                }}
                secureTextEntry
              />

              {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

              <Button
                label="Set new password"
                variant="primary"
                onPress={handleResetPassword}
                loading={loading}
                style={{ marginTop: 12 }}
              />

              <Button
                label="Send a new code"
                variant="ghost"
                onPress={handleSendCode}
                disabled={loading}
              />
            </View>
          )}
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
    marginBottom: 16,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  header: {
    marginBottom: 28,
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
});
