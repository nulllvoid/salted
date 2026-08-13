import { test, expect } from '../fixtures/auth';
import { dbQuery } from '../fixtures/db';
import { getPollForDate, resetPollState, triggerClosePoll, triggerDispatchCook } from '../fixtures/poll-state';
import { addToCartAsUser, seedOpenPoll } from '../fixtures/seed-poll';
import { TEST_FLAT_ID, TEST_USERS } from '../fixtures/test-users';

test.describe('Poll lifecycle: locking the cart', () => {
  test.afterEach(async () => {
    await resetPollState();
  });

  test('closing a poll locks the cart and shows the read-only menu with action buttons', async ({ ownerPage }) => {
    await resetPollState();
    seedOpenPoll(['palak-paneer', 'dal-tadka', 'tomato-rasam']);
    addToCartAsUser(TEST_USERS.owner.id, 'palak-paneer', 2);
    addToCartAsUser(TEST_USERS.priya.id, 'dal-tadka', 1);

    await triggerClosePoll();

    const poll = getPollForDate() as { status: string } | null;
    expect(poll?.status).toBe('closed');

    // Reload rather than just switching tabs: use-today-cart.ts only
    // re-fetches on mount (or via its cart_items/daily_polls realtime
    // channel, which doesn't exist yet if the page mounted before the poll
    // did — see e2e/README.md "Known gap: stale poll state without reload").
    await ownerPage.reload();
    await ownerPage.waitForTimeout(3000);
    // "Dinner tonight" (lib/meal-copy.ts's mealTitle) — TEST_FLAT_ID's group
    // meal defaults to 'dinner' (groups-stub.ts has no per-flat DB column
    // yet, so getMealTypes falls back to ['dinner'] for any group with no
    // AsyncStorage entry, and this suite never sets one for TEST_FLAT_ID).
    await expect(ownerPage.getByText('Dinner tonight', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(ownerPage.getByText('Palak Paneer', { exact: true })).toBeVisible();
    await expect(ownerPage.getByText('Dal Tadka', { exact: true })).toBeVisible();
    await expect(ownerPage.getByText('Grocery list', { exact: true })).toBeVisible();
    await expect(ownerPage.getByText('Preview cook message', { exact: true })).toBeVisible();

    // Locked: no stepper controls, no Remove action.
    await expect(ownerPage.getByText('Remove', { exact: true })).toHaveCount(0);
  });

  test('locked cart shows quantities as plain text, not editable steppers', async ({ ownerPage }) => {
    // The actual write-lock is enforced by RLS (cart_items: members write
    // while open, supabase/migrations/20260109000000_cart_items.sql) — not
    // independently exercisable via dbQuery, which runs as service role and
    // bypasses RLS entirely. This test instead verifies the user-facing
    // guarantee: once locked, the UI offers no way to trigger an edit.
    await resetPollState();
    seedOpenPoll(['palak-paneer', 'dal-tadka']);
    addToCartAsUser(TEST_USERS.owner.id, 'palak-paneer', 2);

    await triggerClosePoll();

    const poll = getPollForDate() as { status: string } | null;
    expect(poll?.status).toBe('closed');

    await ownerPage.reload();
    await ownerPage.waitForTimeout(3000);
    await expect(ownerPage.getByText('Palak Paneer', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(ownerPage.getByText('Remove', { exact: true })).toHaveCount(0);
    // Scoped to :visible — Expo Router can leave zero-size, detached '+'
    // nodes in the DOM across a screen transition (confirmed via manual DOM
    // probing: same nodes, 0x0 bounding rect), so an unscoped getByText
    // false-fails here even when no stepper is actually rendered.
    await expect(ownerPage.getByText('+', { exact: true }).locator('visible=true')).toHaveCount(0);

    const quantity = dbQuery(
      `select ci.quantity from cart_items ci join daily_polls dp on dp.id = ci.poll_id
       where dp.flat_id = '${TEST_FLAT_ID}';`
    ) as { quantity: number }[];
    expect(quantity[0].quantity).toBe(2); // unchanged
  });

  test('menu and action buttons remain visible after dispatch, not just while closed', async ({ ownerPage }) => {
    await resetPollState();
    seedOpenPoll(['palak-paneer', 'dal-tadka']);
    addToCartAsUser(TEST_USERS.owner.id, 'palak-paneer', 3);
    await triggerClosePoll();

    await triggerDispatchCook();

    const poll = getPollForDate() as { status: string } | null;
    expect(poll?.status).toBe('dispatched');

    await ownerPage.reload();
    await ownerPage.waitForTimeout(3000);
    // Regression guard: the menu used to disappear once status flipped from
    // 'closed' to 'dispatched', hiding the Grocery list / Preview cook
    // message links exactly when they matter most.
    // "Dinner tonight" (lib/meal-copy.ts's mealTitle) — TEST_FLAT_ID's group
    // meal defaults to 'dinner' (groups-stub.ts has no per-flat DB column
    // yet, so getMealTypes falls back to ['dinner'] for any group with no
    // AsyncStorage entry, and this suite never sets one for TEST_FLAT_ID).
    await expect(ownerPage.getByText('Dinner tonight', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(ownerPage.getByText('Grocery list', { exact: true })).toBeVisible();
    await expect(ownerPage.getByText('Preview cook message', { exact: true })).toBeVisible();
  });

  test("cancels the poll when every member is marked out today", async () => {
    await resetPollState();
    seedOpenPoll(['palak-paneer', 'dal-tadka']);

    dbQuery(`
      insert into day_attendance (flat_id, flat_meal_id, user_id, poll_date, is_out)
      select '${TEST_FLAT_ID}', dp.flat_meal_id, fm.user_id, dp.poll_date, true
      from flat_members fm
      cross join (
        select flat_meal_id, poll_date from daily_polls
        where flat_id = '${TEST_FLAT_ID}' order by poll_date desc limit 1
      ) dp
      where fm.flat_id = '${TEST_FLAT_ID}'
      on conflict (flat_id, user_id, poll_date, flat_meal_id) do update set is_out = true;
    `);

    await triggerClosePoll();

    const poll = getPollForDate() as { status: string } | null;
    expect(poll?.status).toBe('cancelled');

    // revert attendance for later specs
    dbQuery(
      `update day_attendance set is_out = false where flat_id = '${TEST_FLAT_ID}' and poll_date = (select poll_date from daily_polls where flat_id = '${TEST_FLAT_ID}' order by poll_date desc limit 1);`
    );
  });

  test('an empty cart at dispatch time logs a pipeline error and does not mark the poll dispatched', async () => {
    await resetPollState();
    seedOpenPoll(['palak-paneer', 'dal-tadka']);
    // Nobody adds anything to the cart.
    await triggerClosePoll();
    await triggerDispatchCook();

    const poll = getPollForDate() as { status: string } | null;
    expect(poll?.status).toBe('closed'); // not 'dispatched'

    const errors = dbQuery(
      `select detail from pipeline_errors where stage = 'dispatch_cook' and flat_id = '${TEST_FLAT_ID}' order by created_at desc limit 1;`
    ) as { detail: { message: string } }[];
    expect(errors[0]?.detail?.message).toBe('empty cart at dispatch time');
  });
});
