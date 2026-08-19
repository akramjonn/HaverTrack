import React, { useEffect, useRef, useState } from 'react';
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
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { describeAuthError, isCollegeEmail } from '@/lib/authErrors';

const RESEND_COOLDOWN_SECONDS = 45;

/**
 * Two jobs, one screen:
 *  - `confirm` proves the signup address is real, which is what issues the session.
 *  - `college` attaches a @haverford.edu / @brynmawr.edu address to an account that
 *    signed up with something else, which is what unlocks DC menus.
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; email?: string }>();
  const mode = params.mode === 'college' ? 'college' : 'confirm';

  const user = useAuthStore((state) => state.user);
  const loadProfile = useAuthStore((state) => state.loadProfile);

  const [address, setAddress] = useState(params.email ?? '');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>(
    mode === 'confirm' && params.email ? 'verify' : 'request'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    mode === 'confirm' && params.email ? `We sent a code to ${params.email}.` : null
  );
  const [cooldown, setCooldown] = useState(0);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    timer.current = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [cooldown > 0]);

  const handleSendCode = async () => {
    setError(null);
    setNotice(null);

    const target = address.trim().toLowerCase();

    if (mode === 'college' && !isCollegeEmail(target)) {
      setError('Please enter a valid @haverford.edu or @brynmawr.edu email.');
      return;
    }
    if (mode === 'confirm' && !target.includes('@')) {
      setError('Enter the email address you signed up with.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'college') {
        // Changing the account email sends a code to the new address; confirming
        // it is what proves the student owns it.
        const { error: updateError } = await supabase.auth.updateUser({ email: target });
        if (updateError) {
          setError(describeAuthError(updateError).message);
          return;
        }
      } else {
        const { error: resendError } = await supabase.auth.resend({
          type: 'signup',
          email: target,
        });
        if (resendError) {
          setError(describeAuthError(resendError).message);
          return;
        }
      }

      setStep('verify');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice(`We sent a code to ${target}.`);
    } catch (err: any) {
      setError(describeAuthError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    const token = otpCode.trim();

    if (token.length < 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    try {
      const target = address.trim().toLowerCase();
      const { error: verifyError } = await supabase.auth.verifyOtp(
        mode === 'college'
          ? { email: target, token, type: 'email_change' }
          : { email: target, token, type: 'signup' }
      );

      if (verifyError) {
        setError(describeAuthError(verifyError).message);
        return;
      }

      // The database trigger recomputes college_verified from the confirmed
      // address, so the profile has to be re-read rather than patched here.
      const currentUserId = useAuthStore.getState().user?.id ?? user?.id;
      if (currentUserId) await loadProfile(currentUserId);

      router.replace('/(onboarding)/goal' as any);
    } catch (err: any) {
      setError(describeAuthError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'college' ? 'Verify college email' : 'Confirm your email';
  const blurb =
    step === 'request'
      ? mode === 'college'
        ? 'To view live Haverford DC menus and nutrition numbers, link your college email.'
        : 'Enter the address you signed up with and we will send a new code.'
      : `We sent a verification code to ${address}. Enter it below.`;

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

          <View style={styles.iconHeader}>
            <View style={styles.iconCircle}>
              <ShieldCheck size={28} color={Colors.scarlet} />
            </View>
          </View>

          <View style={styles.header}>
            <Text style={Typography.displayL}>{title}</Text>
            <Text style={[Typography.body, { color: Colors.textMuted, marginTop: 8 }]}>
              {blurb}
            </Text>
          </View>

          {step === 'request' ? (
            <View style={styles.form}>
              <Input
                label={mode === 'college' ? 'COLLEGE EMAIL' : 'EMAIL'}
                placeholder="username@haverford.edu"
                value={address}
                onChangeText={(t) => {
                  setAddress(t);
                  setError(null);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                hint={
                  mode === 'college' ? 'Accepts @haverford.edu or @brynmawr.edu' : undefined
                }
              />

              {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

              <Button
                label="Send verification code"
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

              {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
              {!error && notice ? <Text style={styles.noticeBanner}>{notice}</Text> : null}

              <Button
                label={mode === 'college' ? 'Verify and unlock menus' : 'Confirm email'}
                variant="primary"
                onPress={handleVerifyOtp}
                loading={loading}
                style={{ marginTop: 12 }}
              />

              <Button
                label={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                variant="ghost"
                disabled={cooldown > 0 || loading}
                onPress={handleSendCode}
                style={{ marginTop: 8 }}
              />

              <Button
                label="Change email"
                variant="ghost"
                onPress={() => {
                  setStep('request');
                  setOtpCode('');
                  setError(null);
                }}
              />
            </View>
          )}

          <View style={styles.footer}>
            <Text style={styles.disclaimer}>
              SquirrelTrack verifies student domain to protect dining data.
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
    marginBottom: 16,
  },
  iconHeader: {
    marginBottom: 20,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
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
  noticeBanner: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.green,
    marginBottom: 12,
  },
  footer: {
    marginTop: 40,
    alignItems: 'center',
  },
  disclaimer: {
    ...Typography.micro,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
