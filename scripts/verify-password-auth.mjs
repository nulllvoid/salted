// Real password grants with disposable accounts; no email/SMS is sent.
import { createClient } from '../app/node_modules/@supabase/supabase-js/dist/index.mjs';
import { chromium } from '../app/node_modules/playwright/index.mjs';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import ts from '../app/node_modules/typescript/lib/typescript.js';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const client = createClient(url, anon, options);
const ids = [];
let browser;
function check(error) {
  if (error) throw error;
}
try {
  const email = `password-${randomUUID()}@example.invalid`;
  const password = `Salted-${randomUUID()}!`;
  const username = `test_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  check(error);
  ids.push(data.user.id);
  check((await client.auth.signInWithPassword({ email, password })).error);
  const wrong = await client.auth.signInWithPassword({
    email,
    password: 'incorrect-password',
  });
  if (!wrong.error) throw new Error('Wrong password was accepted');
  await client.auth.signOut();
  // Exercise the undeployed Edge handler against real Auth and database APIs.
  let handler;
  globalThis.Deno = {
    env: {
      get: (key) =>
        key === 'SUPABASE_URL'
          ? url
          : key === 'SUPABASE_ANON_KEY'
            ? anon
            : process.env[key],
    },
    serve: (fn) => {
      handler = fn;
    },
  };
  const edge = ts
    .transpileModule(
      readFileSync('supabase/functions/password_login/index.ts', 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      },
    )
    .outputText.replace(
      'npm:@supabase/supabase-js@2',
      new URL(
        '../app/node_modules/@supabase/supabase-js/dist/index.mjs',
        import.meta.url,
      ).href,
    );
  await import(
    `data:text/javascript;base64,${Buffer.from(edge).toString('base64')}`
  );
  async function usernameRequest(name, pass) {
    return handler(
      new Request('http://localhost/password_login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '192.0.2.1',
        },
        body: JSON.stringify({ username: name, password: pass }),
      }),
    );
  }
  const aliasResult = await usernameRequest(username, password);
  const aliasSession = await aliasResult.json();
  if (aliasResult.status !== 200 || !aliasSession.access_token)
    throw new Error('Username handler failed');
  const aliasWrong = await usernameRequest(username, 'incorrect-password');
  if (aliasWrong.status !== 400)
    throw new Error('Username accepted wrong password');
  const unknown = await usernameRequest(
    'missing_' + randomUUID().slice(0, 8),
    password,
  );
  if (
    JSON.stringify(await unknown.json()) !==
    JSON.stringify(await aliasWrong.json())
  )
    throw new Error('Username failure reveals account existence');
  const denied = await fetch(`${url}/rest/v1/login_usernames?select=*`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  if (denied.ok) throw new Error('Anonymous alias access allowed');
  // Reserved fictional phone range; admin confirmation sends no SMS.
  const phone = '+12025550147';
  const createdPhone = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  });
  check(createdPhone.error);
  ids.push(createdPhone.data.user.id);
  check((await client.auth.signInWithPassword({ phone, password })).error);
  await client.auth.signOut();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.goto('http://localhost:8081/onboarding/password');
  await page.getByLabel('Email or phone', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page
    .getByText('The login details don’t match.', { exact: false })
    .waitFor();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Made for your taste.', { exact: true }).waitFor();
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:8081/onboarding/password');
  // Generate a real recovery code without sending mail. Only the delivery
  // request is intercepted; verification and password update use live Auth.
  const recovery = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
  });
  check(recovery.error);
  await page.route('**/auth/v1/recover**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page
    .getByRole('button', { name: 'Forgot password?', exact: true })
    .click();
  await page.getByLabel('Email or phone', { exact: true }).fill(email);
  await page
    .getByRole('button', { name: 'Send recovery instructions', exact: true })
    .click();
  await page
    .getByLabel('Verification code', { exact: true })
    .fill(recovery.data.properties.email_otp);
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await page.getByText('Choose a new password.', { exact: true }).waitFor();
  const replacement = `Reset-${randomUUID()}!`;
  await page.getByLabel('Password', { exact: true }).fill(replacement);
  await page.getByLabel('Confirm password', { exact: true }).fill(replacement);
  await page
    .getByRole('button', { name: 'Save new password', exact: true })
    .click();
  await page.getByText('Made for your taste.', { exact: true }).waitFor();
  check(
    (await client.auth.signInWithPassword({ email, password: replacement }))
      .error,
  );
  if (!(await client.auth.signInWithPassword({ email, password })).error)
    throw new Error('Old password still works after recovery');
  await client.auth.signOut();
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:8081/onboarding/password');
  await page
    .getByRole('button', { name: 'Create an account', exact: true })
    .click();
  await page
    .getByLabel('Email address', { exact: true })
    .fill(`signup-${randomUUID()}@example.invalid`);
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm password', { exact: true }).fill('short');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await page
    .getByText('Use at least 10 characters for your password.', { exact: true })
    .waitFor();
  mkdirSync('app/e2e/artifacts', { recursive: true });
  await page.screenshot({
    path: 'app/e2e/artifacts/password-signup.png',
    fullPage: true,
  });
  const settings = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: anon },
  }).then((r) => r.json());
  if (settings.mailer_autoconfirm) {
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    const response = page.waitForResponse(
      (r) =>
        r.url().includes('/auth/v1/signup') && r.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    const body = await (await response).json();
    if (!body.user?.id) throw new Error('Signup failed');
    ids.push(body.user.id);
    await page.getByText('Made for your taste.', { exact: true }).waitFor();
  }
  if (pageErrors.length) throw new Error(pageErrors.join('\n'));
  console.log(
    'PASS live email/phone password grants, private username handler, alias privacy, wrong-password rejection, browser login/signup and recovery code/password replacement.',
  );
} finally {
  await browser?.close();
  for (const id of ids) check((await admin.auth.admin.deleteUser(id)).error);
}
