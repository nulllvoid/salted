// Isolated live-backend smoke test. Creates its own identities/household and
// removes only those records in finally. No email or WhatsApp is sent.
import { readFileSync, mkdirSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from '../app/node_modules/playwright/index.mjs';
const address = new URL(
  readFileSync('supabase/.temp/pooler-url', 'utf8').trim(),
);
const db = new pg.Client({
  host: address.hostname,
  port: Number(address.port),
  user: address.username,
  database: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: {
    rejectUnauthorized: true,
    ca: readFileSync('supabase/.temp/root.crt', 'utf8'),
  },
});
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const users = [randomUUID(), randomUUID()];
let household, browser, page;
function token(user, session) {
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      aud: 'authenticated',
      role: 'authenticated',
      sub: user,
      session_id: session,
      exp: now + 3600,
      iat: now,
    }),
  ).toString('base64url');
  const signed = `${head}.${body}`;
  return `${signed}.${createHmac('sha256', process.env.SUPA_JWT).update(signed).digest('base64url')}`;
}
async function api(path, bearer, body, method = 'POST') {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok)
    throw new Error(
      `Backend ${path.split('?')[0]} returned ${r.status}: ${(await r.text()).slice(0, 180)}`,
    );
  return r.status === 204 ? null : r.json();
}
function assert(value, message) {
  if (!value) throw new Error(message);
}
try {
  await db.connect();
  const sessions = [randomUUID(), randomUUID()];
  for (let i = 0; i < 2; i++) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [
      users[i],
      `release-${users[i]}@example.invalid`,
    ]);
    await db.query(
      "insert into auth.sessions(id,user_id,created_at,updated_at,not_after,aal) values($1,$2,now(),now(),now()+interval '1 hour','aal1')",
      [sessions[i], users[i]],
    );
    await db.query(
      'insert into public.profiles(id,display_name) values($1,$2)',
      [users[i], i === 0 ? 'Aarav' : 'Meera'],
    );
  }
  const tokens = users.map((u, i) => token(u, sessions[i]));
  household = await api('rpc/create_household', tokens[0], {
    p_name: 'The shared table · release check',
    p_meals: ['breakfast', 'dinner'],
  });
  await api(
    `flat_members?select=flat_id,flats(id,name,flat_meals!flat_meals_flat_id_fkey(*))&user_id=eq.${users[0]}`,
    tokens[0],
    undefined,
    'GET',
  );
  const flat = (
    await db.query('select invite_code from flats where id=$1', [household])
  ).rows[0];
  await api('rpc/join_household', tokens[1], { p_code: flat.invite_code });
  const meals = (
    await db.query(
      "update flat_meals set serve_time='23:59',close_time='23:58',open_offset_min=60,dispatch_offset_min=1 where flat_id=$1 returning *",
      [household],
    )
  ).rows;
  const dinner = meals.find((m) => m.name === 'Dinner');
  const breakfast = meals.find((m) => m.name === 'Breakfast');
  const date = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const polls = [];
  for (const meal of [dinner, breakfast])
    polls.push(
      (
        await db.query(
          "insert into daily_polls(flat_id,flat_meal_id,poll_date,status) values($1,$2,$3,'open') returning id",
          [household, meal.id, date],
        )
      ).rows[0].id,
    );
  const recipes = (
    await db.query(
      "select id,slug from recipes where slug in ('dal-tadka','palak-paneer','poha')",
    )
  ).rows;
  for (let i = 0; i < 2; i++)
    await db.query(
      'insert into poll_options(poll_id,recipe_id,position) values($1,$2,1)',
      [polls[i], recipes.find((r) => r.slug === (i ? 'poha' : 'dal-tadka')).id],
    );
  await db.query(
    "insert into cooks(flat_id,name,phone,language) values($1,'Sunita','+919999999999','en')",
    [household],
  );
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    {
      key: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
      session: {
        access_token: tokens[0],
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'release-check-only',
        user: { id: users[0], role: 'authenticated' },
      },
    },
  );
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', async (r) => {
    if (r.status() >= 400 && r.url().includes('/rest/v1/'))
      console.log(
        'REST failure',
        new URL(r.url()).pathname,
        r.status(),
        (await r.text()).slice(0, 500),
      );
  });
  await page.goto('http://localhost:8081');
  await page
    .getByRole('button', { name: 'Dinner', exact: true })
    .click({ timeout: 60000 });
  await page
    .getByRole('button', { name: 'Add Dal Tadka', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Increase servings of Dal Tadka' })
    .waitFor();
  assert(
    (
      await db.query('select quantity from cart_items where poll_id=$1', [
        polls[0],
      ])
    ).rows[0]?.quantity === 2,
    'Cart did not save correct headcount',
  );
  mkdirSync('app/e2e/artifacts', { recursive: true });
  await page.getByText('SALTED / YOUR SHARED TABLE').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'app/e2e/artifacts/today-mobile.png',
    fullPage: true,
  });
  // Failed writes keep the dish visible and offer a readable recovery message.
  await page.route('**/rest/v1/cart_items?**', async (route) => {
    if (route.request().method() === 'DELETE')
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Connection interrupted' }),
      });
    else await route.continue();
  });
  await page
    .getByRole('button', { name: 'Remove Dal Tadka', exact: true })
    .click();
  await page
    .getByText('We couldn’t connect. Check your connection and try again.')
    .waitFor();
  assert(
    (
      await db.query('select count(*) from cart_items where poll_id=$1', [
        polls[0],
      ])
    ).rows[0].count === '1',
    'Failed delete changed the menu',
  );
  await page.unroute('**/rest/v1/cart_items?**');
  await page.getByRole('button', { name: 'Who’s in?' }).click();
  await page.getByRole('switch', { name: 'Meera is eating' }).click();
  await page.getByText('1 of 2 people eating this meal.').waitFor();
  assert(
    (
      await db.query(
        'select flat_meal_id from day_attendance where flat_id=$1 and is_out',
        [household],
      )
    ).rows.every((r) => r.flat_meal_id === dinner.id),
    'Attendance leaked across meals',
  );
  await page.getByRole('button', { name: 'Back to the menu' }).click();
  await page.getByRole('button', { name: 'Breakfast', exact: true }).click();
  await page
    .getByRole('button', { name: 'Add Poha (Flattened Rice)', exact: true })
    .waitFor();
  await page.getByText('2 people eating', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Dinner', exact: true }).click();
  await page
    .getByRole('button', { name: 'Search for a dish', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Dish name', exact: true })
    .fill('palak paneer');
  await page.getByRole('button', { name: 'Add to menu', exact: true }).click();
  await page
    .getByRole('button', { name: 'Increase servings of Palak Paneer' })
    .waitFor();
  await page.getByRole('button', { name: 'View household groceries' }).click();
  await page.getByRole('checkbox').first().waitFor();
  await page.getByRole('checkbox').first().click();
  await page.getByRole('checkbox', { checked: true }).first().waitFor();
  await page.screenshot({
    path: 'app/e2e/artifacts/groceries-mobile.png',
    fullPage: true,
  });
  await page.goto('http://localhost:8081/settings');
  await page.getByText('Your preferences', { exact: true }).waitFor();
  await page.screenshot({
    path: 'app/e2e/artifacts/settings-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: /Dinner Served/ }).click();
  await page
    .getByRole('textbox', { name: 'Close menu at', exact: true })
    .fill('23:57');
  await page.getByRole('button', { name: 'Save meal schedule' }).click();
  await page
    .getByText('Schedule saved. The next scheduled check will use these times.')
    .waitFor();
  assert(
    (
      await db.query('select close_time from flat_meals where id=$1', [
        dinner.id,
      ])
    ).rows[0].close_time === '23:57:00',
    'Schedule was not saved',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://localhost:8081');
  await page.getByRole('button', { name: 'Dinner', exact: true }).click();
  await page
    .getByRole('button', { name: 'View household groceries' })
    .waitFor();
  await page.getByText('SALTED / YOUR SHARED TABLE').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'app/e2e/artifacts/today-desktop.png',
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    'Horizontal overflow on desktop',
  );
  await db.query("update daily_polls set status='closed' where id=$1", [
    polls[0],
  ]);
  await db.query(
    "insert into dispatch_log(poll_id,mode,language,headcount,payload_en,payload_translated,status) values($1,'mock','en',1,'Dinner is ready to plan. Dal and paneer for one.','Dinner is ready to plan. Dal and paneer for one.','mocked')",
    [polls[0]],
  );
  await page
    .getByRole('button', { name: 'Refresh meals', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Cook instructions', exact: true })
    .click();
  await page.getByText('Ready to send yourself', { exact: true }).waitFor();
  await page
    .getByRole('button', { name: 'Open WhatsApp to send', exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'app/e2e/artifacts/cook-mobile.png',
    fullPage: true,
  });
  const loggedOut = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await loggedOut.goto('http://localhost:8081/onboarding');
  await loggedOut
    .getByRole('button', { name: 'Continue with Google' })
    .waitFor();
  await loggedOut.screenshot({
    path: 'app/e2e/artifacts/welcome-mobile.png',
    fullPage: true,
  });
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  console.log(
    'PASS: live create/join, cart mutation, per-meal attendance, shared grocery checks, search, failed-write recovery, persisted schedules, cook handoff, mobile/desktop and signed-out rendering.',
  );
} catch (error) {
  console.error(error.message);
  if (page) {
    mkdirSync('app/e2e/artifacts', { recursive: true });
    await page.screenshot({
      path: 'app/e2e/artifacts/failure.png',
      fullPage: true,
    });
    console.log((await page.locator('body').innerText()).slice(0, 2500));
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (household)
    await db.query('delete from public.flats where id=$1', [household]);
  await db
    .query('delete from auth.users where id=any($1::uuid[])', [users])
    .catch(() => {});
  await db.end();
  console.log('Isolated release fixtures cleaned up.');
}
