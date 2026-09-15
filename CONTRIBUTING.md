# Contributing to Salted

Start with the [README](README.md) and [build walkthrough](docs/build-and-run.md). Use a development backend and keep contributions within the product scope in [the PRD](docs/02-prd.md).

## Development workflow

1. Clone the repository and install both root and `app/` dependencies with `npm ci` as shown in the README.
2. Create `app/.env` from the example and configure your development Supabase project. Never commit private keys or account credentials.
3. Create a focused branch from an up-to-date `main`:

   ```sh
   git switch main
   git pull --ff-only
   git switch -c codex/describe-your-change
   ```

4. Make the smallest complete change. Include relevant documentation and regression coverage for changed behavior.
5. Run the checks below, review `git diff`, commit, and push your branch. Open a pull request explaining the problem, resulting behavior, validation, and any deployment steps.

Do not run `reset-project`; it is starter reset tooling, not a development setup step.

## Code and UI conventions

- Keep routes in `app/src/app/`, reusable UI in `components/`, and data/domain logic in `hooks/`, `contexts/`, and `lib/`.
- Reuse typography, spacing, colors, radii, and interactive controls from the [design system](docs/mobile-design-system.md). Check narrow widths, keyboard focus, touch targets, loading/error/empty states, and readable labels.
- Preserve household, meal, and date scope. Check authorization and RLS when changing reads or writes; UI hiding is not backend authorization.
- Use the SDK 57 documentation before editing Expo-specific behavior, as required by `app/AGENTS.md`.
- Install Expo/native dependencies with `npx expo install <package>` from `app/` to select compatible versions. Commit the relevant `package.json` and `package-lock.json` together.
- Keep generated native projects, build output, dependency directories, test artifacts, editor metadata, and local Supabase caches ignored. Do not force-add them.

## Checks before a PR

From `app/`:

```sh
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:e2e:typecheck
```

Unit tests use Playwright as a runner but do not need browser binaries, a running app, or backend credentials. For changes affecting bundling, assets, routes, or dependencies, also run:

```sh
npx expo export --platform all
```

From the repository root:

```sh
git diff --check
git status --short
```

For visual changes, inspect the running app at narrow phone and desktop widths and include screenshots or a concise verification note. Test native-specific changes on the affected platform. Do not report an export as a signed build or device test.

## Live integration tests

`npm run test:e2e` uses a real Supabase backend and modifies shared test fixtures. It is not the default offline check. The existing fixture IDs and project assumptions must be adapted to a dedicated test project before running on a fresh checkout. Do not point it at a household used by real users.

Review `app/e2e/fixtures/test-users.ts`, `app/e2e/fixtures/db.ts`, and [the E2E notes](app/e2e/README.md) first. Those notes contain historical environment assumptions; authentication now includes password and OAuth flows, not only the original magic-link flow.

Prerequisites include the test schema/data, appropriate Supabase CLI/database access, and the test project's `SUPA_JWT` signing secret for the current fixture implementation. Keep this secret local; never prefix it with `EXPO_PUBLIC_`. The fixture scheme depends on the target project's auth configuration and is not general end-user login validation.

From `app/`, after setup:

```sh
npx playwright install chromium
npm run test:e2e
# Or interactive test UI:
npm run test:e2e:ui
```

The config starts/reuses Expo web on port 8081 and runs one worker because fixtures share state. Review fixture cleanup and reports after failures. Do not parallelize shared fixtures without isolating them first.

The root `scripts/verify-release.mjs` is another live write-based verification tool, not a harmless smoke check. See [release readiness](docs/release-readiness.md#verification) for its assumptions.

## Database, Edge Functions, and recipe data

- Add a timestamped SQL migration under `supabase/migrations/`; do not rewrite an already-applied migration. Update `docs/05-schema.sql` alongside schema changes.
- Test the migration against a development database and add relevant SQL checks under `supabase/tests/`. Include rollout order and compatibility with older app versions in the PR.
- Regenerate application database types when the schema changes. With a linked development project, from the root:

  ```sh
  npx supabase gen types typescript --linked --schema public > app/src/types/database.ts
  ```

  Review the generated diff and rerun TypeScript checks.

- Keep Edge Function secrets server-side. A Git push does not deploy functions or apply migrations. Document which functions need deployment and which environment values they require; use the team's target-project credentials deliberately.
- Edit the recipe source generator/curated data rather than treating scraped candidates as approved recipes. Review units, per-person quantities, allergens, diet tags, and meal suitability. Seed only the intended development dataset; the root seed command writes database records.
- Do not commit `supabase/.temp/`. Fresh clones must recreate local CLI linking and any CA/pooler configuration required by custom scripts.

## Pull request checklist

- Explain the user-visible problem and final behavior.
- List checks actually run and any unverified platforms or failure paths.
- Include screenshots for visual changes, using non-sensitive test data.
- Include migration, function deployment, build-variable, or native rebuild requirements.
- Keep credentials, personal data, `node_modules`, generated builds, and test reports out of the diff.
- Preserve lockfiles and source assets needed to reproduce the build.

Report security-sensitive findings privately to the repository maintainers; do not include live credentials or private household data in public issues.
