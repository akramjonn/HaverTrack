import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

export default function OnboardingLayout() {
  const user = useAuthStore((state) => state.user);

  // Onboarding writes to the profile, so it needs a session to write with.
  if (!user) return <Redirect href="/(auth)/welcome" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.cream },
      }}
    >
      <Stack.Screen name="goal" />
      <Stack.Screen name="about" />
      <Stack.Screen name="targets" />
    </Stack>
  );
}
