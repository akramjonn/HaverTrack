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
    return { message: 'Could not reach SquirrelTrack. Check your connection and try again.' };
  }

  return { message: raw || 'Something went wrong. Try again.' };
}

export const COLLEGE_DOMAINS = ['haverford.edu', 'brynmawr.edu'] as const;

export function isCollegeEmail(address: string) {
  const domain = address.trim().toLowerCase().split('@')[1];
  return COLLEGE_DOMAINS.includes(domain as (typeof COLLEGE_DOMAINS)[number]);
}
