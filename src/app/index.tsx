import React from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore, selectIsOnboarded } from '@/store/authStore';

/**
 * Single place that decides where a launch lands. Every other screen redirects
 * here rather than guessing the destination itself.
 */
export default function IndexRoute() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const isOnboarded = useAuthStore(selectIsOnboarded);

  if (!user) return <Redirect href="/(auth)/welcome" />;

  // Profile still loading — the root layout is holding the splash screen.
  if (!profile) return null;

  if (!isOnboarded) return <Redirect href="/(onboarding)/goal" />;

  return <Redirect href="/(tabs)" />;
}
