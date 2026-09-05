/** Parse both PKCE OAuth callbacks and email confirmation links. */
export function parseAuthCallback(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  new URLSearchParams(parsed.hash.slice(1)).forEach((value, key) => params.set(key, value));
  if (params.has('error') || params.has('error_code')) {
    throw new Error(params.get('error_description') || params.get('error') || 'Sign-in failed. Try again.');
  }
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  return {
    code: params.get('code'),
    tokens: access_token && refresh_token ? { access_token, refresh_token } : null,
  };
}
