# Salted

Shared meal planning for households: choose dishes and servings together, combine groceries, and prepare a concise message for your cook.

Built with Expo SDK 57, React Native, TypeScript, Expo Router, and Supabase. Android, iOS, and web share the app in `app/`.

## Start here

- [Android, iOS, and web build walkthrough](docs/build-and-run.md)
- [Contribution guide](CONTRIBUTING.md)
- [Design system](docs/mobile-design-system.md)
- [UI verification report](docs/ui-ux-verification-2026-09-14.md)

## Quick start: web

Install Git and Node.js 22.13 or newer (Expo SDK 57 minimum; see the [versioned reference](https://docs.expo.dev/versions/v57.0.0/)). Use npm and the committed lockfiles.

```sh
git clone https://github.com/nulllvoid/salted.git
cd salted
npm ci
cd app
npm ci
```

Copy `app/.env.example` to `app/.env` and fill in your development Supabase project's public URL and anon key. From `app/`:

```powershell
# PowerShell
Copy-Item .env.example .env
```

```sh
# macOS/Linux
cp .env.example .env
```

Run only the copy command for your shell, then edit `.env` before starting:

```sh
npm run web -- --port 8081
```

Open http://localhost:8081. The app needs a configured Supabase backend; it has no offline demo mode. For backend setup and authentication redirects, see the [walkthrough](docs/build-and-run.md#backend-and-authentication).

The root `npm ci` installs database/data tooling. The separate `app/npm ci` installs the application dependencies; these are not npm workspaces.

## What works and what needs setup

- Household creation/joining, meal schedules, shared menus and servings, attendance, groceries, and preferences are implemented.
- Cook messages can be copied or opened in WhatsApp for manual sending. Automatic BSP delivery is not implemented; opening WhatsApp is not delivery confirmation.
- Android internal APK and production AAB profiles exist in `app/eas.json`.
- iOS requires an Apple bundle identifier and signing setup; no simulator-specific EAS profile is committed.
- An EAS account/project and build environment variables must be configured before cloud builds. A Git push does not deploy Supabase functions or produce a mobile release.
- Native compilation/export and browser checks do not replace testing signed builds on devices. Historical release notes are in [release readiness](docs/release-readiness.md).

## Common commands

Run from `app/`:

| Command | Purpose |
| --- | --- |
| `npm start` | Start Metro/Expo |
| `npm run web` | Run web development server |
| `npm run android` / `npm run ios` | Start Expo and open the platform; these do not create release binaries |
| `npx expo run:android` / `npx expo run:ios` | Compile and launch locally; iOS requires macOS |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | App type checking |
| `npm run test:unit` | Pure unit tests; no backend or browser required |
| `npm run test:e2e:typecheck` | E2E TypeScript checks |
| `npx expo export --platform web` | Generate static web output in `app/dist/` |

Live E2E tests write backend data. Follow [CONTRIBUTING.md](CONTRIBUTING.md) before running them.

## Repository map

| Path | Purpose |
| --- | --- |
| `app/src/app/` | Expo Router screens |
| `app/src/components/`, `app/src/constants/` | Shared UI and design tokens |
| `app/src/hooks/`, `app/src/contexts/`, `app/src/lib/` | Data access, state, and domain logic |
| `app/e2e/unit/`, `app/e2e/tests/` | Unit and live integration tests |
| `supabase/migrations/` | Versioned database changes; apply in order |
| `supabase/functions/` | Poll scheduling, dispatch, authentication, webhook logic |
| `supabase/tests/` | SQL regression checks |
| `data/`, `supabase/seed/` | Recipe sources and seed tooling |
| `scripts/` | Database, verification, branding, and scraping tooling |
| `docs/` | Product requirements, architecture, design, and operational notes |

Keep schema changes in a migration and update `docs/05-schema.sql` to reflect the model. Dependencies, generated builds, private environment files, and local Supabase/IDE caches must stay untracked. Commit both package manifests and lockfiles when dependencies change.
