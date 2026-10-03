/** Parse both PKCE OAuth callbacks and email confirmation links. */
export function parseAuthCallback(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  new URLSearchParams(parsed.hash.slice(1)).forEach((value, key) => params.set(key, value));
  // URL bearer tokens are not bound to a sign-in started on this device. Reject
  // them even alongside a code so legacy/implicit links cannot install a session.
  if (params.has('access_token') || params.has('refresh_token')) {
    throw new Error('This sign-in link is no longer supported. Return to sign in and try again.');
  }
  if (params.has('error') || params.has('error_code')) {
    throw new Error(params.get('error_description') || params.get('error') || 'Sign-in failed. Try again.');
  }
  return {
    code: params.get('code'),
  };
}
