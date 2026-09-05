import assert from 'node:assert/strict';
import { isCollegeEmail, describeAuthError } from '../src/lib/authErrors';
import { parseAuthCallback } from '../src/lib/authCallback';

for (const address of ['student@haverford.edu', ' Student@HAVERFORD.EDU ', 'student+app@haverford.edu']) {
  assert.equal(isCollegeEmail(address), true, address);
}
for (const address of ['', '@haverford.edu', 'student@gmail.com', 'student@brynmawr.edu',
  'student@haverford.edu.attacker.com', 'student@sub.haverford.edu',
  'student@haverford.edu@attacker.com', 'student name@haverford.edu']) {
  assert.equal(isCollegeEmail(address), false, address);
}
assert.equal(parseAuthCallback('havertrack://auth/callback?code=one-use-code').code, 'one-use-code');
assert.deepEqual(parseAuthCallback('https://app.example/auth/callback#access_token=a&refresh_token=r').tokens,
  { access_token: 'a', refresh_token: 'r' });
assert.equal(parseAuthCallback('havertrack://auth/callback#access_token=a').tokens, null);
assert.throws(() => parseAuthCallback('havertrack://auth/callback#error=access_denied&error_description=Use%20%40haverford.edu'), /haverford.edu/);
assert.throws(() => parseAuthCallback('havertrack://auth/callback?error_code=unexpected_failure'), /Sign-in failed/);
assert.match(describeAuthError(new Error('email not confirmed')).message, /Confirm/);
console.log('Auth domain, callback and error tests passed.');
