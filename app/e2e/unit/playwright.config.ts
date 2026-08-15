import { defineConfig } from '@playwright/test';

// Pure unit tests over the Edge Functions' shared logic. Deliberately a
// separate project from e2e/playwright.config.ts: that one boots an Expo web
// server and drives a browser against the live Supabase project, which these
// tests need none of. Playwright is already a devDependency, so this adds a
// test runner for supabase/functions/** without a new dependency (Deno is not
// installed in this environment).
export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  workers: undefined,
  reporter: [['list']],
});
