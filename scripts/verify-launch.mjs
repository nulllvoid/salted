import { chromium } from '../app/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:8081/onboarding');
  const splash = page.getByTestId('animated-launch');
  await splash.waitFor();
  const steam = splash.locator('path').first();
  const before = await steam.getAttribute('d');
  await page.waitForTimeout(700);
  if (before === await steam.getAttribute('d')) throw new Error('Steam is static');
  await page.waitForTimeout(1350);
  mkdirSync('app/e2e/artifacts', { recursive: true });
  await page.screenshot({ path: 'app/e2e/artifacts/animated-launch.png' });
  await splash.waitFor({ state: 'detached', timeout: 8500 });
  await page.getByRole('button', { name: 'Continue with password' }).waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.getByRole('button', { name: 'Continue with password' }).waitFor();
  await splash.waitFor({ state: 'detached', timeout: 3000 });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('PASS animated steam, launch dismissal, reduced-motion launch and navigation; no browser errors.');
} finally { await browser.close(); }
