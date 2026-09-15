# Salted app

The Android, iOS, and web application lives here. Run app commands from this directory, not the repository root.

- [Project README and quick start](../README.md)
- [Complete Android, iOS, and web walkthrough](../docs/build-and-run.md)
- [Contribution guide and checks](../CONTRIBUTING.md)
- [Design system](../docs/mobile-design-system.md)

```sh
npm ci
# Copy .env.example to .env and set your development backend values first.
npm run web -- --port 8081
```

Routes are in `src/app/`. Native configuration is in `app.json`; cloud build profiles are in `eas.json`. The `android` and `ios` npm scripts start Expo; use the build walkthrough to compile native apps or create distributable binaries.

Do not use `npm run reset-project` for normal development: it is leftover starter tooling that moves/replaces application code.
