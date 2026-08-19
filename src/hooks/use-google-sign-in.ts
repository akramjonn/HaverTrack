import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithGoogle } from '@/lib/googleAuth';

/**
 * One Google button handler shared by welcome, sign-in and sign-up. On
 * success the root route decides between onboarding and the tabs; the only
 * branch handled here is the unverified-college fallback, which predates the
 * @haverford.edu gate and covers accounts created before it existed.
 */
export function useGoogleSignIn() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const signIn = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { profile } = await signInWithGoogle();

      // On web this only started a full-page redirect; the root layout
      // exchanges the returning code and routing happens there.
      if (Platform.OS === 'web') return;

      if (!profile?.college_verified) {
        router.push({ pathname: '/(auth)/verify-email', params: { mode: 'college' } } as any);
        return;
      }

      router.replace('/' as any);
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed.');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  return { signIn, isLoading, error, clearError };
}
