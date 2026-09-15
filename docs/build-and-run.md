# Build and run Salted

Commands below run from `app/` unless marked **repository root**. Complete the [README setup](../README.md#quick-start-web) first. These instructions describe the checked-in configuration; they do not mean a signed build has been produced or published.

## Choose your workflow

| Goal | Workflow | Result |
| --- | --- | --- |
| Develop in a browser | `npm run web` | Local web server |
| Develop Android locally | `npx expo run:android` | Installed debug app + Metro |
| Develop iOS on a Mac | `npx expo run:ios` | Simulator debug app + Metro |
| Install Android without Metro | EAS `preview` | APK |
| Prepare Google Play release | EAS `production` | AAB |
| Prepare iOS release | EAS `production`, after Apple setup | Signed iOS artifact |
| Host web | `npx expo export --platform web` | Static files in `dist/` |

## Backend and authentication

Use a development Supabase project. A fresh checkout does not contain credentials, linked-project caches, or the database itself.

1. Obtain access to the team's development project, or create your own and configure its schema using `supabase/migrations/` in timestamp order. The schema snapshot in `docs/05-schema.sql` is reference documentation, not a replacement for migration history.
2. Put the project's public values in `app/.env`:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   EXPO_PUBLIC_USERNAME_LOGIN_ENABLED=false
   ```

3. Configure the auth providers you intend to use in Supabase. Allow the actual web origin (locally `http://localhost:8081`), password recovery route, and native `salted://` redirect paths. Review `supabase/config.toml` and [password login](password-login.md); do not copy an old LAN IP as your device redirect.
4. Username login remains disabled until the username migration and `password_login` function are deployed. Google sign-in also needs provider configuration. Test redirects on each target platform.
5. Restart Expo after environment changes. Public values are embedded during bundling; changing hosting variables after exporting does not change the existing bundle.

For an empty development project, use an authenticated Supabase CLI from the **repository root**:

```sh
npx supabase login
npx supabase link --project-ref YOUR_DEVELOPMENT_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Review the target and migration list before applying. Seeding is a separate operation: the root `npm run seed` reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the shell. Use private developer configuration, and inspect `supabase/seed/seed-recipes.ts` before running it. Deploy required Edge Functions separately; review scheduler configuration and function authentication before enabling cron jobs. Linking alone does not provision recipe data, OAuth providers, or function secrets.

Only public Supabase configuration belongs in client builds. Service-role keys, `SUPA_JWT`, database passwords, and management tokens must remain outside public build variables.

The custom `scripts/db.mjs` and `scripts/migrate.mjs` additionally require a linked pooler URL, `SUPABASE_DB_PASSWORD`, and a valid CA certificate at `supabase/.temp/root.crt`. These ignored local files are not supplied by cloning; see [release readiness](release-readiness.md#database-tooling).

## Android: local debug build

1. Install Android Studio, JDK 17, Android SDK Platform 36, SDK build tools, platform-tools, and an emulator system image. Set `JAVA_HOME`, `ANDROID_HOME`, and add platform-tools to PATH. Follow the [Expo Android setup](https://docs.expo.dev/workflow/android-studio-emulator/) for your OS.
2. Start a virtual device from Android Studio's Device Manager, or connect a phone with USB debugging enabled and authorize your computer.
3. Confirm the device is visible:

   ```sh
   adb devices
   ```

4. From `app/`, compile and launch:

   ```sh
   npx expo run:android
   ```

   Expo generates the ignored `android/` project when needed, compiles a debug app, installs it, and starts Metro. Configuration comes from `app.json`; avoid relying on uncommitted edits in generated native folders.

5. For subsequent JavaScript edits, keep Metro running. If restarting it, use `npm run android`. Re-run the native build when native dependencies or config plugins change.

`npm run android` alone starts Expo; it does not create an APK for distribution. Expo Go is only an optional preview when its SDK/modules match; use a native build to verify auth redirects and native behavior. A custom Expo development client is not configured in this repository.

## Android: downloadable APK or store AAB

The checked-in application ID is `com.flatmeal.salted`. Confirm your intended ownership before creating store records.

### One-time EAS setup

```sh
npx eas-cli@latest login
npx eas-cli@latest init
```

Select the intended Expo account/project. Review the resulting `extra.eas.projectId` and any ownership changes in `app.json` before committing. Existing profiles are in `eas.json`; do not replace them blindly.

In the EAS project dashboard, configure `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` for both **preview** and **production** environments. Use the appropriate backend for each. To make the mapping explicit, add `"environment": "preview"` to `build.preview` and `"environment": "production"` to `build.production` in `eas.json`. Keep values out of Git. See [Expo build setup](https://docs.expo.dev/build/setup/).

### APK for testers

```sh
npx eas-cli@latest build --platform android --profile preview
```

The existing preview profile uses internal distribution and `buildType: apk`. Complete the signing prompts with the intended project credentials. Download the APK from the returned build page. Open it on a test phone, or install the downloaded file:

```sh
adb install -r /path/to/salted.apk
```

An APK can run without Metro. An AAB cannot be installed directly this way. See [Expo APK builds](https://docs.expo.dev/build-reference/apk/).

### Google Play artifact

```sh
npx eas-cli@latest build --platform android --profile production
```

This profile produces an AAB and increments the remote version. Download it for a Play Console testing track. Building does not submit or publish the app; store access, signing ownership, listing information, and release review are separate steps.

## iOS: local simulator or device

Local iOS compilation requires macOS and Xcode. SDK 57 lists iOS 16.4+ and Xcode 26.4+ in the [version matrix](https://docs.expo.dev/versions/v57.0.0/). Install Xcode command-line tools and a simulator runtime; complete Xcode's initial setup.

`expo.ios` is currently empty in `app.json`. Before a signed build, set `ios.bundleIdentifier` to an identifier owned by your team. Do not invent a production identity or reuse another team's credentials.

```sh
# macOS, from app/
npx expo run:ios
# For a connected iPhone instead:
npx expo run:ios --device
```

The device build requires appropriate Apple signing. Expo generates the ignored `ios/` directory. CocoaPods setup may be requested during the first native build. After installation, `npm run ios` starts Expo and opens iOS; it is not a release build command.

## iOS: cloud builds

EAS can queue cloud iOS builds from Windows or Linux, but running an iOS simulator still requires a Mac. Complete the EAS setup above, configure the bundle identifier, and supply the appropriate Apple Developer signing/provisioning credentials for device distribution.

```sh
npx eas-cli@latest build --platform ios --profile production
```

Use the artifact with your team's App Store Connect/TestFlight process. Submission is separate from building. For internal device distribution, the existing `preview` profile needs registered devices and provisioning setup.

For a simulator artifact, first add a separate profile under `build` in `eas.json` (this profile is not committed):

```json
"simulator": {
  "extends": "preview",
  "ios": { "simulator": true }
}
```

```sh
npx eas-cli@latest build --platform ios --profile simulator
npx eas-cli@latest build:run --platform ios --latest
```

Run the installation command on a Mac. Simulator artifacts cannot be installed on physical iPhones. See [Expo simulator builds](https://docs.expo.dev/build-reference/simulators/).

## Web: development, export, and hosting

```sh
npm run web -- --port 8081
```

For a production static export:

```sh
npx expo export --platform web
npx serve dist --listen 3000
```

Open http://localhost:3000 to inspect the export. Add that origin to your development auth redirect allowlist if testing sign-in there. The app uses `web.output: static`, so host the contents of `app/dist/` on a static host that resolves exported HTML routes and assets. Do not assume a blanket SPA fallback is required. Test direct loading and refreshing `/settings` and the auth/recovery routes after deployment. Configure HTTPS and the deployed origin in Supabase auth redirects. See [Expo static rendering](https://docs.expo.dev/router/web/static-rendering/).

No web host or automatic publishing pipeline is configured by these instructions. Supply public environment values before export, and redeploy a new export when they change.

## Verify a build

From `app/`:

```sh
npx tsc --noEmit
npm run lint
npm run test:unit
npx expo export --platform all
```

The last command checks bundling for all platforms; it does not produce a signed APK, AAB, or IPA. Test actual builds for sign-in/recovery, create/join household, Today/Tomorrow selection, meal changes, grocery lists, cook message copy/manual send, keyboard visibility, small screens, large text, and light/dark appearance. Use disposable test data for writes.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing Supabase URL/key | Create `app/.env`, verify names, restart Metro; set EAS variables for cloud builds |
| Android SDK or Java not found | Verify `JAVA_HOME`, `ANDROID_HOME`, `adb devices`, and installed Platform 36 |
| Phone cannot load Metro | Same reachable network, firewall permission, or USB forwarding with `adb reverse tcp:8081 tcp:8081` |
| OAuth returns to wrong page | Supabase redirect allowlist, provider configuration, `salted` scheme, actual host/port |
| Old JS/config remains | Stop Metro and run `npx expo start --clear`; rebuild native code for native dependency changes |
| APK update fails due to signing mismatch | Use the original signing key; uninstalling loses local app state, so do not do that casually |
| iOS profile/bundle errors | Confirm identifier, Apple team, certificate, provisioning, and registered device |
| Web route works by navigation but not refresh | Check static host HTML route resolution and uploaded export structure |
| Empty menus after backend setup | Verify migrations, recipes, schedules, and deployed scheduler functions |
| Cook message says ready to send | Manual delivery is expected until a BSP send adapter is implemented |
