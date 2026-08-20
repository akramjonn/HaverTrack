import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithGoogle } from '@/lib/googleAuth';
import { useAuthStore } from '@/store/authStore';

/**
 * One Google button handler shared by welcome, sign-in and sign-up. Routing is
 * left entirely to the root route, which decides between onboarding and the
 * tabs. No verification hop exists: the enforce_google_domain trigger already
 * guarantees a Google account is @haverford.edu before it can be created.
 */
export function useGoogleSignIn() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // A web sign-in failure is reported by the root layout after a full page
  // reload, by which point this hook's own state has been thrown away and
  // recreated. Reading the store's copy is what lets the button that started
  // the flow show why it failed.
  const storeError = useAuthStore((state) => state.oauthError);
  const setOAuthError = useAuthStore((state) => state.setOAuthError);

  const clearError = useCallback(() => {
    setLocalError(null);
    setOAuthError(null);
  }, [setOAuthError]);

  const signIn = useCallback(async () => {
    setLocalError(null);
    setOAuthError(null);
    setIsLoading(true);
    try {
      await signInWithGoogle();

      // On web this only started a full-page redirect. The spinner is left
      // running deliberately — the document is already navigating away, and
      // dropping it first makes the button flash back to idle as if the tap
      // had been ignored.
      if (Platform.OS === 'web') return;

      setIsLoading(false);
      router.replace('/' as any);
    } catch (err: any) {
      setLocalError(err?.message || 'Google sign-in failed.');
      setIsLoading(false);
    }
  }, [router, setOAuthError]);

  return { signIn, isLoading, error: localError ?? storeError, clearError };
}
