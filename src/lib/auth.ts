import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { isCollegeEmail } from './authErrors';
import { parseAuthCallback } from './authCallback';

export function getAuthRedirectUrl() {
  return Linking.createURL('auth/callback', { scheme: 'havertrack' });
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
let lastCallback: { url: string; promise: Promise<void> } | undefined;
export function completeAuthCallback(url: string): Promise<void> {
  if (lastCallback?.url === url) return lastCallback.promise;
  const promise = (async () => {
    const callback = parseAuthCallback(url);
    if (callback.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
      if (error) throw error;
    } else if (callback.tokens) {
      // Also support confirmation links generated before PKCE was enabled.
      const { error } = await supabase.auth.setSession(callback.tokens);
      if (error) throw error;
    } else {
      throw new Error('This sign-in link is incomplete. Return to sign in and try again.');
    }
    await requireHaverfordUser();
  })();
  lastCallback = { url, promise };
  return promise;
}
