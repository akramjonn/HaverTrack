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
assert.equal(parseAuthCallback('https://app.example/auth/callback#code=one-use-code').code, 'one-use-code');
for (const callback of [
  '?access_token=a&refresh_token=r', '#access_token=a&refresh_token=r',
  '#access_token=a', '?refresh_token=r', '?access_token=',
  '?access_token=a#refresh_token=r', '?code=one-use-code#access_token=a&refresh_token=r',
  '?%61ccess_token=a&%72efresh_token=r',
]) {
  assert.throws(() => parseAuthCallback(`havertrack://auth/callback${callback}`), /Return to sign in/);
}
assert.throws(() => parseAuthCallback('havertrack://auth/callback#error=access_denied&error_description=Use%20%40haverford.edu'), /haverford.edu/);
assert.throws(() => parseAuthCallback('havertrack://auth/callback?error_code=unexpected_failure'), /Sign-in failed/);
assert.match(describeAuthError(new Error('email not confirmed')).message, /Confirm/);
console.log('Auth domain, callback and error tests passed.');
