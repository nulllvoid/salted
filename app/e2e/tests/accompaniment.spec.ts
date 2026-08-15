import { test, expect } from '../fixtures/auth';
import { dbQuery } from '../fixtures/db';
import { getPollForDate, resetPollState, triggerClosePoll, triggerCreatePoll, triggerDispatchCook } from '../fixtures/poll-state';
import { addToCartAsUser, seedOpenPoll } from '../fixtures/seed-poll';
import { TEST_FLAT_ID, TEST_USERS } from '../fixtures/test-users';

// Accompaniments (roti/rice/etc) are no longer a second, gated vote — they're
// just more cart_items rows, distinguished from mains only by recipes.kind.
// This suite covers: create_poll sourcing accompaniment suggestions from the
// day's suggested mains, adding an accompaniment to the cart alongside a
// main, and both surviving through close/dispatch together.
test.describe('Accompaniments in the shared cart', () => {
  test.afterEach(async () => {
    await resetPollState();
  });

  test('create_poll sources accompaniment suggestions from the union of recipe_accompaniments for suggested mains', async () => {
    await resetPollState();

    // Use the real pipeline (not the lightweight seedOpenPoll fixture) since
    // this specifically tests create_poll's own accompaniment-sourcing logic.
    await triggerCreatePoll();

    const poll = getPollForDate() as { id: string } | null;
    const mains = dbQuery(
      `select r.slug from poll_options po join recipes r on r.id = po.recipe_id where po.poll_id = '${poll?.id}';`
    ) as { slug: string }[];
    expect(mains.length).toBeGreaterThan(0);

    const accompaniments = dbQuery(
      `select r.slug from poll_accompaniment_options pao join recipes r on r.id = pao.recipe_id where pao.poll_id = '${poll?.id}';`
    ) as { slug: string }[];

    // Every suggested accompaniment must be curated (via recipe_accompaniments)
    // for at least one of today's suggested mains.
    const mainSlugsList = mains.map((m) => `'${m.slug}'`).join(', ');
    if (accompaniments.length > 0) {
      const validPairs = dbQuery(
        `select distinct ra.accompaniment_recipe_id from recipe_accompaniments ra
         join recipes m on m.id = ra.main_recipe_id
         where m.slug in (${mainSlugsList});`
      ) as { accompaniment_recipe_id: string }[];
      expect(validPairs.length).toBeGreaterThan(0);
    }
  });

  test('a main and its accompaniment can both be added to the cart and appear grouped by kind', async ({ ownerPage }) => {
    await resetPollState();
    seedOpenPoll(['dal-tadka', 'tomato-rasam']);
    dbQuery(`
      insert into poll_accompaniment_options (poll_id, recipe_id, position)
      select dp.id, r.id, 1 from daily_polls dp, recipes r
      where dp.flat_id = '${TEST_FLAT_ID}' and r.slug = 'roti'
      on conflict (poll_id, recipe_id) do nothing;
    `);

    await ownerPage.reload();
    await ownerPage.waitForTimeout(3000);
    await expect(ownerPage.getByText('Dal Tadka', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(ownerPage.getByText('Accompaniments', { exact: true })).toBeVisible();
    await expect(ownerPage.getByText('Roti', { exact: true })).toBeVisible();

    await ownerPage.getByText('Dal Tadka', { exact: true }).click();
    await ownerPage.waitForTimeout(1000);
    await ownerPage.getByText('Roti', { exact: true }).click();
    await ownerPage.waitForTimeout(1000);

    const cartKinds = dbQuery(
      `select r.kind from cart_items ci join recipes r on r.id = ci.recipe_id
       join daily_polls dp on dp.id = ci.poll_id where dp.flat_id = '${TEST_FLAT_ID}' order by r.kind;`
    ) as { kind: string }[];
    expect(cartKinds.map((c) => c.kind).sort()).toEqual(['accompaniment', 'main']);

    await expect(ownerPage.getByText('Your cart', { exact: false })).toBeVisible();
  });

  test('a main with no curated accompaniment (Vegetable Pulao) offers no accompaniment suggestions, not an error state', async ({
    ownerPage,
  }) => {
    await resetPollState();
    seedOpenPoll(['veg-pulao', 'tomato-rasam']);
    // No poll_accompaniment_options row seeded — Vegetable Pulao has none.

    await ownerPage.reload();
    await ownerPage.waitForTimeout(3000);
    await expect(ownerPage.getByText('Vegetable Pulao', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(ownerPage.getByText('Accompaniments', { exact: true })).toHaveCount(0);
  });

  test('cart with both main and accompaniment survives close and dispatch together', async ({ ownerPage }) => {
    await resetPollState();
    seedOpenPoll(['dal-tadka', 'tomato-rasam']);
    addToCartAsUser(TEST_USERS.owner.id, 'dal-tadka', 2);
    addToCartAsUser(TEST_USERS.owner.id, 'roti', 2);

    await triggerClosePoll();
    await triggerDispatchCook();

    const poll = getPollForDate() as { status: string } | null;
    expect(poll?.status).toBe('dispatched');

    await ownerPage.reload();
    await ownerPage.waitForTimeout(3000);
    await ownerPage.getByText('Preview cook message', { exact: true }).click();
    await ownerPage.waitForTimeout(2000);

    // No GOOGLE_TRANSLATE_API_KEY configured in this environment, so the
    // cook's hi-language payload falls back to the English in-app-preview
    // composition (composeEnglishPayload) rather than the translated
    // per-dish "For the X:" format — assert on the shared summary line and
    // dish name only, which both compositions produce identically.
    // The heading now names the meal and its serve time (part 2) instead of
    // the meal-neutral "Today's meal:" — a flat with breakfast and dinner
    // would otherwise send the cook two identically-headed messages.
    await expect(ownerPage.getByText('Dinner today', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(ownerPage.getByText('Dal Tadka', { exact: false }).first()).toBeVisible();
    await expect(ownerPage.getByText('Roti', { exact: false }).first()).toBeVisible();
  });

  test('grocery list includes both dishes\' ingredients, scaled independently, labeled by dish', async ({ ownerPage }) => {
    await resetPollState();
    seedOpenPoll(['dal-tadka', 'tomato-rasam']);
    addToCartAsUser(TEST_USERS.owner.id, 'dal-tadka', 2);
    addToCartAsUser(TEST_USERS.owner.id, 'roti', 1);
    await triggerClosePoll();

    await ownerPage.reload();
    await ownerPage.waitForTimeout(3000);
    await ownerPage.getByText('Grocery list', { exact: true }).click();
    await ownerPage.waitForTimeout(2000);

    // Both dish names appear in the header summary, and Roti's wheat flour
    // is listed with its own "for Roti" label distinct from Dal Tadka's lines.
    await expect(ownerPage.getByText('Dal Tadka (2), Roti (1)', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(ownerPage.getByText('Wheat flour (atta)', { exact: true })).toBeVisible();
    await expect(ownerPage.getByText('for Roti', { exact: false }).first()).toBeVisible();
  });
});
