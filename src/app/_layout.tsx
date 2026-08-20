import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { completeWebOAuthCallback, hasPendingWebOAuthCallback } from '@/lib/googleAuth';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  const initAuth = useAuthStore((state) => state.initAuth);
  const isAuthInitialized = useAuthStore((state) => state.isInitialized);
  const setOAuthError = useAuthStore((state) => state.setOAuthError);

  // Web sign-in lands back on the app with ?code=... (or an error in the
  // fragment); the PKCE verifier is in localStorage, so exchanging it here is
  // all the callback handling needed, and detectSessionInUrl is off so nothing
  // else would consume the code.
  //
  // The gate is the point. The exchange is a network round-trip, while
  // getSession() only reads localStorage, so without holding rendering back
  // the index route resolves "signed out" first and redirects to the welcome
  // screen — stranding a user who did in fact just sign in. Seeding the state
  // synchronously from the URL is what makes the gate close before the first
  // render rather than after it.
  const [oauthCallbackPending, setOAuthCallbackPending] = useState(
    hasPendingWebOAuthCallback
  );

  useEffect(() => {
    const unsubscribe = initAuth();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!oauthCallbackPending) return;
    let cancelled = false;
    completeWebOAuthCallback()
      .then((message) => {
        if (!cancelled && message) setOAuthError(message);
      })
      .finally(() => {
        if (!cancelled) setOAuthCallbackPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [oauthCallbackPending]);

  const isReady = (loaded || error) && isAuthInitialized && !oauthCallbackPending;

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ flex: 1, backgroundColor: Colors.cream }}>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.cream },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="gallery" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(admin)" options={{ headerShown: false }} />
          <Stack.Screen
            name="scan"
            options={{
              presentation: 'fullScreenModal',
              animation: 'fade',
            }}
          />
          <Stack.Screen
            name="food/[id]"
            options={{
              presentation: 'modal',
            }}
          />
        </Stack>
      </View>
    </QueryClientProvider>
  );
}
