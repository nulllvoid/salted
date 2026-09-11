# Password authentication

Email and phone password sign-in are available alongside Google. The password screen supports account creation, password visibility, matching passwords (10–128 characters), phone SMS confirmation, and email/phone recovery. Phone numbers must include a country code. Passwords are handled by Supabase Auth; they are never stored in public tables.

Production migration `20260911000002_password_usernames.sql` adds a private, unique, case-normalized username registry and a service-only rate limiter. Signup reserves the requested username transactionally; changing user metadata cannot reassign a login. Existing display names and profile phone fields are not login identifiers.

## Username deployment

The `password_login` Edge handler resolves a username privately, then authenticates with Supabase Auth. It returns sessions only after a valid password grant. Unknown usernames and wrong passwords share the same response. Requests are limited per username and IP. No credentials are logged.

The configured process and Windows user `SUPABASE_ACCESS_TOKEN` both return HTTP 401 from the management API. The database migration is live, but the Edge handler cannot be deployed with that token. Username controls remain disabled until deployment:

1. Replace the management token with a valid personal access token.
2. Deploy: `npx supabase functions deploy password_login --project-ref pcmtsfcjzoivagpslpch`.
3. Set `EXPO_PUBLIC_USERNAME_LOGIN_ENABLED=true` in the app build environment and restart Metro/rebuild.

## Recovery and provider setup

The app requests an email recovery link using its actual `reset-password` redirect URI. Add the web site's `/reset-password` and native `salted://reset-password` URLs to the production Auth redirect allowlist. Development Expo Go URLs are listed in `supabase/config.toml`; that file does not automatically change hosted Auth settings. PKCE links must open in the same browser/app that requested recovery. Email templates can include `{{ .Token }}` to let users paste a recovery code instead.

Phone signup/recovery requires an operational SMS provider and applicable provider registration. Existing verified phone accounts can already sign in with a password. No real SMS or email was sent by verification. Email signup is currently auto-confirmed in production; this change does not alter that existing provider setting.

## Verification

`node --env-file=app/.env scripts/verify-password-auth.mjs` creates disposable accounts and verifies real email/phone password grants, wrong-password rejection, the local Edge handler against production Auth/database APIs, anonymous alias access denial, and browser login/signup. It deletes its accounts in `finally`. `supabase/tests/password-usernames.sql` verifies uniqueness, privacy, immutable identity, throttling and cascading cleanup inside a rollback. Unit tests cover identifier normalization and password validation.
