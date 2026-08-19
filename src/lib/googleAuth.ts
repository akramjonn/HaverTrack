import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

/**
 * `prompt=select_account` always shows the account chooser.
 *
 * There is deliberately no `hd` (hosted domain) parameter. It only pre-filters
 * Google's own UI — it is not enforcement, and the `enforce_google_domain`
 * trigger already refuses to create a non-Haverford Google user. What it *did*
 * do was hang the sign-in: when the browser holds Google sessions that don't
 * match the hosted domain, the account-switch step (accounts.google.<tld>
 * /accounts/SetSID) can stall instead of resolving. Showing the chooser and
 * rejecting the wrong account afterwards, with a clear message, beats a page
 * that freezes.
 */
const GOOGLE_QUERY_PARAMS = { prompt: 'select_account' } as const;

export interface GoogleSignInResult {
  /**
   * The profile as it stands immediately after sign-in — role/college_verified
   * are fresh. Null on web, where this function only kicks off a full-page
   * redirect and the callback is handled by the root layout.
   */
  profile: ReturnType<typeof useAuthStore.getState>['profile'];
}

/**
 * Google sign-in via a browser tab rather than the native Google Sign-In SDK.
 * The native SDK needs a config plugin and a custom dev build; this needs
 * nothing beyond what Expo Go already ships, at the cost of a browser hop
 * instead of a native account picker.
 *
 * Google sign-in is for @haverford.edu accounts only. The `hd` parameter
 * pre-filters Google's account picker, but it is just a UI hint — the
 * enforcement that matters is the `enforce_google_domain` trigger on
 * auth.users, which refuses to create non-Haverford Google users at all.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: GOOGLE_QUERY_PARAMS,
      },
    });
    if (error) throw new Error(describeGoogleError(error.message));

    // The page now navigates to Google. When it comes back with ?code=...,
    // the root layout exchanges it and the auth listener handles routing.
    return { profile: null };
  }

  const redirectTo = Linking.createURL('/');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: GOOGLE_QUERY_PARAMS,
    },
  });

  if (error) throw new Error(describeGoogleError(error.message));
  if (!data.url) throw new Error('Google sign-in did not return a login URL.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('Sign-in was cancelled.');
  }
  if (result.type !== 'success' || !result.url) {
    throw new Error('Google sign-in did not complete.');
  }

  const { queryParams } = Linking.parse(result.url);
  const errorDescription = queryParams?.error_description;
  if (errorDescription) {
    throw new Error(describeGoogleError(String(errorDescription)));
  }

  const code = queryParams?.code;
  if (!code || typeof code !== 'string') {
    throw new Error('Google did not return a valid sign-in code.');
  }

  const { data: sessionData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw new Error(describeGoogleError(exchangeError.message));

  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Signed in, but no session was returned.');

  // The auth-state listener in authStore will also pick this up, but loading
  // the profile here means the caller can route on it immediately instead of
  // guessing whether the listener has already run.
  const profile = await useAuthStore.getState().loadProfile(userId);

  return { profile };
}

/**
 * The `enforce_google_domain` trigger is the only expected signup failure,
 * but Supabase often wraps a DB-raised OAuth error as the generic
 * "Database error saving new user" — so both shapes map to the same answer.
 */
function describeGoogleError(raw: string): string {
  const message = raw.toLowerCase();
  if (message.includes('haverford.edu') || message.includes('database error saving new user')) {
    return 'SquirrelTrack is for @haverford.edu Google accounts.';
  }
  return raw;
}
