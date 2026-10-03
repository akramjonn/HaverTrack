import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { isCollegeEmail } from './authErrors';
import { parseAuthCallback } from './authCallback';

export function getAuthRedirectUrl() {
  // In native builds createURL embeds the Metro host during development
  // (havertrack://192.168.x.x:8081/auth/callback), which Router can't match and
  // changes per network. Expo Go must keep its exp:// URL; web uses the origin.
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return Linking.createURL('auth/callback');
  }
  return 'havertrack://auth/callback';
}

export async function requireHaverfordUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user?.email || !isCollegeEmail(user.email) || !user.email_confirmed_at) {
    await supabase.auth.signOut({ scope: 'local' });
    throw new Error('Sign in with a verified @haverford.edu email.');
  }
  return user;
}

// The native browser result and Router callback may arrive together. Exchange
// each single-use code once, including under React Strict Mode.
let lastCallback: { code: string; promise: Promise<void> } | undefined;
export function completeAuthCallback(url: string): Promise<void> {
  let callback;
  try {
    callback = parseAuthCallback(url);
  } catch (error) {
    return Promise.reject(error);
  }
  if (!callback.code) {
    return Promise.reject(new Error('This sign-in link is incomplete. Return to sign in and try again.'));
  }
  const code = callback.code;
  if (lastCallback?.code === code) return lastCallback.promise;
  const promise = (async () => {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    await requireHaverfordUser();
  })();
  lastCallback = { code, promise };
  return promise;
}

/**
 * Google OAuth via Supabase (PKCE). On web the page redirects to Google and
 * lands on /auth/callback; natively an auth session sheet returns the callback
 * URL here. Resolves false when the user closes the sheet.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const redirectTo = getAuthRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: Platform.OS !== 'web',
      // Nudge Google's account picker toward Haverford accounts; the domain is
      // still enforced by requireHaverfordUser after the exchange.
      queryParams: { hd: 'haverford.edu', prompt: 'select_account' },
    },
  });
  if (error) throw error;
  if (Platform.OS === 'web') return new Promise(() => {}); // navigating away

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (__DEV__) console.log('[auth] Google', { redirectTo, result: result.type, url: result.type === 'success' ? result.url.split('?')[0] : undefined });
  if (result.type !== 'success') return false;
  await completeAuthCallback(result.url);
  return true;
}
