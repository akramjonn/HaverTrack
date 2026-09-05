import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { completeAuthCallback } from '@/lib/auth';
import { describeAuthError } from '@/lib/authErrors';
import { Button } from '@/components/ui';
import { Colors, Typography } from '@/constants/theme';

export default function AuthCallbackScreen() {
  const url = Linking.useLinkingURL();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let active = true;
    completeAuthCallback(url).then(() => {
      if (active) router.replace('/');
    }).catch((err: Error) => {
      if (active) setError(describeAuthError(err).message);
    }).finally(() => {
      if (Platform.OS === 'web') window.history.replaceState(null, '', '/auth/callback');
    });
    return () => { active = false; };
  }, [url, router]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.cream, padding: 24, justifyContent: 'center', gap: 20 }}>
      <Text style={Typography.displayL}>{error ? 'Could not sign in' : 'Finishing sign-in…'}</Text>
      {error ? <>
        <Text style={Typography.body}>{error}</Text>
        <Text style={Typography.body}>For email confirmation, open the link on the device where you registered. If your email is already confirmed, return to sign in.</Text>
        <Button label="Return to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
      </> : <ActivityIndicator color={Colors.scarlet} />}
    </View>
  );
}
