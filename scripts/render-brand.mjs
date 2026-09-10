import { readFileSync } from 'node:fs';
import { chromium } from '../app/node_modules/playwright/index.mjs';
const svg = readFileSync('app/assets/salted-mark.svg', 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const [file, size, background] of [
    ['salted-icon.png', 1024, '#f5ead8'],
    ['salted-foreground.png', 1024, 'transparent'],
    ['salted-splash.png', 256, 'transparent'],
    ['salted-favicon.png', 64, '#f5ead8'],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:${background}">${svg}</body></html>`,
    );
    await page.screenshot({
      path: `app/assets/${file}`,
      omitBackground: background === 'transparent',
    });
  }
} finally {
  await browser.close();
}
