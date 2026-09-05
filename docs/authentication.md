# Haverford authentication

Google OAuth and email/password signup both require an exact `@haverford.edu`
address. A verified campus email establishes email ownership, not enrollment;
distinguishing students from staff requires a college-provided roster or SSO claim.

## Hosted configuration

The connected Supabase project has Google enabled with its existing client
credentials. Email confirmation is required (`mailer_autoconfirm = false`).
The native callback and Site URL are `havertrack://auth/callback`.
The redirect allow list includes that callback and the existing localhost URLs.
Add the exact production web `/auth/callback` URL when hosting the web app.

**Remaining setup:** configure custom SMTP in Supabase Authentication → Email.
The default Supabase mail service only delivers to project team members, so
ordinary students cannot finish email registration until SMTP is configured.
Provide a verified sender address, SMTP host, port, username, and password in
the dashboard. Keep credentials out of Expo public environment variables.
See [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

Google does not require SMTP. Google Cloud must allow the intended users in the
OAuth audience and use the Supabase `/auth/v1/callback` URL as its authorized
redirect URI. Existing credentials were retained; a student must complete a
real Google login to verify the audience and consent configuration.

Use an installed app or development build for native OAuth; Expo Go cannot
provide the stable custom scheme used by this flow. Implementation follows
[Expo v57 WebBrowser](https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser/) and
[Supabase mobile linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).
Rebuild the native app after installing `expo-crypto`. It supplies secure random
values and SHA-256 for Supabase PKCE on Hermes; browser WebCrypto stays native.

## Enforcement

`20260905012401_haverford_auth.sql` rejects outside domains on auth user creation
and email changes, regardless of provider or client. Confirmation timestamps
control profile verification. User metadata never grants verification or roles.
The Google `hd` parameter is only a chooser hint, not the authorization check.
The client also rejects outside domains and unconfirmed sessions.

This migration was applied separately and recorded in `public.schema_migrations`;
unrelated pending migrations were not applied. Existing users were not deleted.
Addresses created while autoconfirm was enabled retain their historical
confirmation timestamps; those timestamps are not retroactive proof of ownership.

## Checks

- `node --import tsx scripts/test-auth.ts`
- `npx tsc --noEmit`
- `npx expo export --platform web --output-dir /tmp/havertrack-auth-web`
- Execute `supabase/tests/haverford_auth.sql` inside `BEGIN` / `ROLLBACK` against
  a database with the migration applied. It creates temporary auth rows to
  check provider gates, email changes, confirmation and metadata spoofing; it
  does not send emails. Never commit the test transaction.

On a device, test Google success/cancellation/an outside account; email
registration, confirmation, resend and password login; and cold-start callback
handling. Open confirmation links on the device/browser used to register so
PKCE can access its stored verifier. If a link was opened elsewhere and already
confirmed the email, return to sign in with the email and password.
