import { chromium } from '../app/node_modules/playwright/index.mjs';
import { createClient } from '../app/node_modules/@supabase/supabase-js/dist/index.mjs';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const client = createClient(
  url,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  options,
);
let user, browser;
const households = [];
function check(result) {
  if (result.error) throw result.error;
  return result.data;
}
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8081/onboarding');
  await page.getByTestId('animated-launch').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByRole('tab', { name: '2 of 3: Share a grocery list' })
    .waitFor();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByRole('button', { name: 'Get started', exact: true })
    .waitFor();
  mkdirSync('app/e2e/artifacts', { recursive: true });
  await page.screenshot({ path: 'app/e2e/artifacts/intro-slide.png' });
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with Google' }).waitFor();
  await page.goto('http://localhost:8081/onboarding');
  await page.waitForURL('**/onboarding/login');
  const email = `scope-${randomUUID()}@example.invalid`,
    password = randomUUID();
  user = check(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  ).user;
  const session = check(
    await client.auth.signInWithPassword({ email, password }),
  ).session;
  check(
    await client
      .from('profiles')
      .insert({ id: user.id, display_name: 'Settings check' }),
  );
  for (const [name, meal] of [
    ['House A', 'dinner'],
    ['House B', 'breakfast'],
  ]) {
    const id = check(
      await client.rpc('create_household', { p_name: name, p_meals: [meal] }),
    );
    households.push(id);
    check(
      await admin
        .from('cooks')
        .insert({
          flat_id: id,
          name: `Cook ${name}`,
          phone: '+12025550148',
          language: 'en',
        }),
    );
  }
  const authKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  await page.evaluate(
    ({ key, session }) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(session));
    },
    { key: authKey, session },
  );
  await page.goto('http://localhost:8081/onboarding');
  await page.waitForURL('**/(tabs)');
  if (await page.getByRole('button', { name: 'Skip', exact: true }).count())
    throw new Error('Logged in user saw intro');
  await page.goto('http://localhost:8081/settings');
  async function section(name) {
    await page
      .getByRole('tablist', { name: 'Settings sections' })
      .getByRole('tab', { name, exact: true })
      .click();
    return page.getByLabel(name, { exact: true });
  }
  async function select(panel, name, house) {
    await panel
      .getByLabel(`Household for ${name}`)
      .getByRole('button', { name: house, exact: true })
      .click();
  }
  // Cook moved onto Household as a collapsible section, so open it before
  // the fields exist. Re-opened after each household switch: the section
  // remounts with the page's activeGroup key.
  const cook = await section('Home');
  async function openCook() {
    if (!(await cook.getByLabel('Cook’s name').count()))
      await cook.getByText('Your cook', { exact: true }).click();
    await cook.getByLabel('Cook’s name').waitFor();
  }
  await select(cook, 'Home', 'House A');
  await openCook();
  await cook.getByLabel('Cook’s name').fill('UNSAVED A');
  await select(cook, 'Home', 'House B');
  await openCook();
  if ((await cook.getByLabel('Cook’s name').inputValue()) !== 'Cook House B')
    throw new Error('Cook draft crossed households');
  await cook.getByLabel('Cook’s name').fill('Updated B');
  await cook.getByRole('button', { name: 'Save cook details' }).click();
  await cook.getByText('Cook details saved.', { exact: false }).waitFor();
  const rows = check(
    await admin.from('cooks').select('flat_id,name').in('flat_id', households),
  );
  if (
    rows.find((r) => r.flat_id === households[0]).name !== 'Cook House A' ||
    rows.find((r) => r.flat_id === households[1]).name !== 'Updated B'
  )
    throw new Error('Cook save affected wrong household');
  await page.screenshot({
    path: 'app/e2e/artifacts/settings-household-scope.png',
  });
  const meals = await section('Meals');
  await select(meals, 'Meals', 'House A');
  await meals.getByRole('button', { name: 'Add a meal', exact: true }).click();
  await select(meals, 'Meals', 'House B');
  if (await meals.getByLabel('Meal name').count())
    throw new Error('New meal draft crossed households');
  const household = await section('Home');
  await select(household, 'Home', 'House A');
  await household
    .getByRole('button', { name: 'Leave household', exact: true })
    .click();
  await select(household, 'Home', 'House B');
  if (
    await household.getByRole('button', { name: 'Keep my membership' }).count()
  )
    throw new Error('Leave confirmation crossed households');
  const about = await section('About');
  await about.getByRole('button', { name: 'Take the quick tour' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForURL('**/settings');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    'PASS intro next/skip/persistence, signed-in bypass, About replay, household draft reset and isolated cook save.',
  );
} finally {
  await browser?.close();
  for (const id of households)
    check(await admin.from('flats').delete().eq('id', id));
  if (user) check(await admin.auth.admin.deleteUser(user.id));
}
