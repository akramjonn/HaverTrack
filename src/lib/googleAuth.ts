import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
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

/**
 * Hard upper bound on how long the auth tab may stay open.
 *
 * `WebBrowser.openAuthSessionAsync` resolves when the browser navigates to a
 * URL matching the `redirectUrl` we handed it, or when the user dismisses the
 * tab. It has no third outcome: if Supabase bounces the browser somewhere else
 * entirely — which is exactly what it does when `redirectTo` is missing from
 * the project's Redirect URLs allow-list, silently substituting the Site URL —
 * the promise never settles, the tab sits on a dead page, and the caller's
 * spinner runs until the app is force-quit. That is the "it just freezes"
 * report. Racing a timer is the only way to turn that into a message. Two and a
 * half minutes is well past the slowest legitimate sign-in (password plus a
 * two-factor prompt) and well short of the user's patience.
 */
const AUTH_SESSION_TIMEOUT_MS = 150_000;

export interface GoogleSignInResult {
  /**
   * The profile as it stands immediately after sign-in — role/college_verified
   * are fresh. Null on web, where this function only kicks off a full-page
   * redirect and the callback is handled by the root layout.
   */
  profile: ReturnType<typeof useAuthStore.getState>['profile'];
}

/**
 * The URL Supabase must send the browser back to once Google is done — and the
 * one string that has to be in the project's Redirect URLs allow-list.
 *
 * `Linking.createURL('/')` is only the right answer inside Expo Go, where the
 * runtime genuinely owns `exp://<host>:8081/--/` and owns nothing else. In a
 * development build it splices the dev server's host into the app scheme and
 * returns something like `squirreltrack://192.168.1.5:8081/`, which changes
 * with every network the laptop joins and therefore can never be kept in an
 * allow-list. A build owns the whole `squirreltrack://` scheme, so the fixed
 * `squirreltrack:///` is both a deep link the app really receives and a single
 * stable entry to allow-list — one that covers dev builds and TestFlight/store
 * builds alike.
 *
 * Getting this wrong does not produce an error anywhere. Supabase quietly
 * swaps an unrecognised `redirectTo` for the project's Site URL, Google
 * succeeds, the browser lands on a page this app never sees, and the auth
 * session hangs. Hence the timeout above and the allow-list wording in
 * `describeGoogleError`.
 */
export function getGoogleRedirectUrl(): string {
  // `window` is genuinely absent while Expo Router prerenders the static web
  // output at build time, and this module is imported by the root layout.
  if (Platform.OS === 'web') {
    return typeof window === 'undefined' ? '' : window.location.origin;
  }

  const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  if (!inExpoGo) {
    const configured = Constants.expoConfig?.scheme;
    const scheme = Array.isArray(configured) ? configured[0] : configured;
    if (scheme) return `${scheme}:///`;
  }

  // Expo Go cannot answer to a custom scheme, so the LAN URL is the only
  // option here even though it moves. It has to be allow-listed by wildcard.
  return Linking.createURL('/');
}

/**
 * Reads the auth parameters out of a returned URL, from both the query string
 * and the fragment.
 *
 * This is not defensive padding. GoTrue reports OAuth failures in the fragment
 * (`squirreltrack:///#error=server_error&error_description=Database+error+saving+new+user`)
 * and mirrors them into the query only in newer releases. `Linking.parse()`
 * reads query parameters exclusively — it has no fragment field at all — so a
 * rejection from the `enforce_google_domain` trigger arrived here looking like
 * "no code and no error" and was reported as the meaningless "Google did not
 * return a valid sign-in code". Reading both halves is what makes the domain
 * gate, and every other server-side failure, say what actually happened.
 */
function parseRedirectParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};

  const collect = (raw: string | undefined) => {
    if (!raw) return;
    // RN's URLSearchParams handles percent- and plus-decoding; the values are
    // taken as-is because decoding a second time throws on a stray `%`.
    new URLSearchParams(raw).forEach((value, key) => {
      if (value) params[key] = value;
    });
  };

  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = beforeHash.indexOf('?');

  collect(queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : undefined);
  collect(hashIndex >= 0 ? url.slice(hashIndex + 1) : undefined);

  return params;
}

/** Turns whichever error shape came back into one thrown Error. */
function throwIfRedirectCarriedError(params: Record<string, string>): void {
  const raw = params.error_description || params.error_code || params.error;
  if (raw) throw new Error(describeGoogleError(raw));
}

/**
 * Races the auth session against the watchdog and closes the tab if the
 * watchdog wins, so a stuck flow does not leave a browser sheet on screen with
 * no way back into the app.
 */
async function openAuthSession(
  authUrl: string,
  redirectTo: string
): Promise<WebBrowser.WebBrowserAuthSessionResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const watchdog = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), AUTH_SESSION_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([
      WebBrowser.openAuthSessionAsync(authUrl, redirectTo),
      watchdog,
    ]);

    if (result) return result;

    try {
      WebBrowser.dismissAuthSession();
    } catch {
      // Only implemented on some platforms; the message below matters more
      // than whether we managed to close the tab.
    }

    throw new Error(
      `Google never sent the browser back to SquirrelTrack. Add "${redirectTo}" to ` +
        'Supabase → Authentication → URL Configuration → Redirect URLs, then try again.'
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Google sign-in via a browser tab rather than the native Google Sign-In SDK.
 * The native SDK needs a config plugin and a custom dev build; this needs
 * nothing beyond what Expo Go already ships, at the cost of a browser hop
 * instead of a native account picker.
 *
 * Google sign-in is for @haverford.edu accounts only. The enforcement that
 * matters is the `enforce_google_domain` trigger on auth.users, which refuses
 * to create non-Haverford Google users at all; everything here just makes its
 * refusal legible.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const redirectTo = getGoogleRedirectUrl();

  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: GOOGLE_QUERY_PARAMS,
      },
    });
    if (error) throw new Error(describeGoogleError(error.message));

    // The page now navigates to Google. When it comes back with ?code=... the
    // root layout calls completeWebOAuthCallback before rendering any route.
    return { profile: null };
  }

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

  const result = await openAuthSession(data.url, redirectTo);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('Sign-in was cancelled.');
  }
  if (result.type !== 'success' || !result.url) {
    throw new Error('Google sign-in did not complete. Please try again.');
  }

  const params = parseRedirectParams(result.url);
  throwIfRedirectCarriedError(params);

  const code = params.code;
  if (!code) {
    // The browser did come back to our scheme but with neither a code nor an
    // error. In practice that means Supabase redirected to the Site URL
    // instead of to `redirectTo` — the allow-list again — so say so rather
    // than blaming Google.
    throw new Error(
      `Sign-in came back without a code. Check that "${redirectTo}" is listed under ` +
        'Supabase → Authentication → URL Configuration → Redirect URLs.'
    );
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
 * True when the page was just loaded by Google handing control back to us.
 *
 * Synchronous on purpose: the root layout has to know *before* it renders any
 * route that a session is about to arrive. Without that, `getSession()` wins
 * the race, reports "signed out", and the index route redirects to the welcome
 * screen a beat before the exchange completes — leaving a fully authenticated
 * user parked on the sign-in screen with no way forward, which is the web half
 * of "Google authentication does not work".
 */
export function hasPendingWebOAuthCallback(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const params = parseRedirectParams(window.location.href);
  return !!(params.code || params.error || params.error_description);
}

/**
 * Finishes the web half of the flow: trades the returned code for a session and
 * scrubs the code out of the address bar so a refresh cannot replay a
 * single-use grant. Resolves to a message to show the user, or null on success.
 *
 * `detectSessionInUrl` is off in the Supabase client, so nothing else consumes
 * the code — this function is the only web callback handler.
 */
export async function completeWebOAuthCallback(): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  const params = parseRedirectParams(window.location.href);
  const cleanUrl = () =>
    window.history.replaceState({}, '', window.location.pathname);

  try {
    throwIfRedirectCarriedError(params);

    if (!params.code) return null;

    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw new Error(describeGoogleError(error.message));

    return null;
  } catch (err: any) {
    return err?.message || 'Google sign-in failed.';
  } finally {
    cleanUrl();
  }
}

/**
 * Maps the error strings Supabase, GoTrue and Google produce onto copy a
 * student can act on. Anything unrecognised is passed through verbatim rather
 * than flattened into a generic failure — an unfamiliar error is still more
 * useful than "something went wrong".
 */
function describeGoogleError(raw: string): string {
  const message = raw.toLowerCase();

  // The `enforce_google_domain` trigger is the only expected signup failure,
  // but Supabase often wraps a DB-raised OAuth error as the generic
  // "Database error saving new user" — so both shapes map to the same answer.
  if (message.includes('haverford.edu') || message.includes('database error saving new user')) {
    return 'SquirrelTrack is for @haverford.edu Google accounts.';
  }

  // Pressing Cancel on Google's consent screen comes back as an OAuth error on
  // the redirect, not as a dismissed browser tab, so it has to be caught here
  // as well as in the `cancel`/`dismiss` branch.
  if (message.includes('access_denied') || message.includes('user denied')) {
    return 'Sign-in was cancelled.';
  }

  if (message.includes('provider is not enabled')) {
    return 'Google sign-in is not switched on for this project yet.';
  }

  // The PKCE verifier is stored on this device and is single-use. It goes
  // missing when storage was cleared, the app was reinstalled mid-flow, or a
  // second sign-in was started before the first finished — all fixed by a retry.
  if (
    message.includes('code verifier') ||
    message.includes('code_verifier') ||
    message.includes('bad_code_verifier') ||
    message.includes('flow_state') ||
    message.includes('bad_oauth_state') ||
    message.includes('expired')
  ) {
    return 'That sign-in attempt expired. Tap Continue with Google again.';
  }

  // Supabase only rejects a redirect explicitly when the URL is malformed; an
  // unlisted-but-valid one is silently replaced by the Site URL instead. Both
  // are the same fix, so name the URL that needs allow-listing either way.
  if (message.includes('redirect') || message.includes('validation_failed')) {
    return `Supabase would not accept this app's sign-in redirect (${getGoogleRedirectUrl()}). Add it under Authentication → URL Configuration → Redirect URLs.`;
  }

  return raw;
}
