import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { Colors, Fonts } from '@/constants/theme';
import { useAuthStore, selectIsAdmin } from '@/store/authStore';

/**
 * Guarding the group itself — the same pattern as `(tabs)/_layout.tsx` — means a
 * deep link cannot land on an admin screen without an admin session. The RPCs
 * behind these screens enforce the role again server-side; this guard is about
 * not showing a student a console they cannot load.
 */
export default function AdminLayout() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const isAdmin = useAuthStore(selectIsAdmin);

  if (!user) return <Redirect href={'/(auth)/welcome' as never} />;

  // The profile carries the role and loads a beat after the session. Rendering
  // nothing for that beat is right; redirecting would bounce a real admin out.
  if (!profile) return null;

  if (!isAdmin) return <Redirect href={'/(tabs)/settings' as never} />;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: Colors.cream },
        headerShadowVisible: false,
        headerTintColor: Colors.scarlet,
        headerTitleStyle: {
          fontFamily: Fonts.outfit.semiBold,
          fontSize: 17,
          color: Colors.ink,
        },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: Colors.cream },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Admin console' }} />
      <Stack.Screen name="users" options={{ title: 'Students' }} />
      <Stack.Screen name="users/[id]" options={{ title: 'Student record' }} />
      <Stack.Screen name="content" options={{ title: 'Menu health' }} />
    </Stack>
  );
}
