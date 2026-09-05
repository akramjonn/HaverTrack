import type { AuthError } from '@supabase/supabase-js';

export type AuthFailure = {
  message: string;
};

/**
 * Turns a Supabase auth error into something a student can act on. Anything we
 * do not recognise keeps Supabase's own wording rather than a generic banner,
 * because a vague message here is what previously hid real failures.
 */
export function describeAuthError(error: AuthError | Error): AuthFailure {
  const raw = error.message || '';
  const message = raw.toLowerCase();

  if (message.includes('haverford.edu')) {
    return { message: 'Use your @haverford.edu email. HaverTrack is reserved for Haverford students.' };
  }
  if (message.includes('email not confirmed')) {
    return { message: 'Confirm your Haverford email using the link in your inbox, then sign in.' };
  }
  if (message.includes('provider is not enabled') || message.includes('unsupported provider')) {
    return { message: 'Google sign-in is unavailable right now. Use your Haverford email and password.' };
  }
  if (message.includes('email address not authorized') || message.includes('error sending confirmation email')) {
    return { message: 'We could not send your confirmation email. Try Continue with Google using your Haverford account.' };
  }
  if (message.includes('database error saving new user')) {
    return { message: 'Could not create your account. Make sure you are using your @haverford.edu account and try again.' };
  }

  if (message.includes('invalid login credentials')) {
    return { message: 'That email and password do not match. Check both and try again.' };
  }

  if (message.includes('user already registered') || message.includes('already been registered')) {
    return { message: 'An account already uses this email. Sign in instead.' };
  }

  if (message.includes('token has expired') || message.includes('invalid token')) {
    return { message: 'That code has expired. Send a new one and try again.' };
  }

  if (message.includes('otp_expired')) {
    return { message: 'That code has expired. Send a new one and try again.' };
  }

  if (message.includes('for security purposes') || message.includes('rate limit')) {
    return { message: 'Too many attempts. Wait a minute before trying again.' };
  }

  if (message.includes('password should be')) {
    return { message: 'Use a password of at least 6 characters.' };
  }

  if (
    message.includes('network request failed') ||
    message.includes('fetch') ||
    message.includes('failed to fetch')
  ) {
    return { message: 'Could not reach HaverTrack. Check your connection and try again.' };
  }

  return { message: raw || 'Something went wrong. Try again.' };
}

export const COLLEGE_DOMAINS = ['haverford.edu'] as const;

export function isCollegeEmail(address: string) {
  return /^[^\s@]+@haverford\.edu$/i.test(address.trim());
}
