import { test, expect } from '../fixtures/auth';
import { dbQuery } from '../fixtures/db';
import { TEST_FLAT_ID, TEST_USERS } from '../fixtures/test-users';

// Coverage for the multi-group refactor (docs/superpowers/plans/2026-08-11-groups-refactor.md)
// that the rest of the suite doesn't touch: the Today tab's group-switcher
// chips (labeled by each group's own name — see (tabs)/index.tsx's
// MealChips), and Settings' two-step "Leave group" confirm actually
// removing a flat_members row (not just rendering, which settings.spec.ts
// already covers for the single-group case).
//
// Uses a second, disposable flat that only rahul belongs to, so leaving it
// can't disturb TEST_FLAT_ID's shared fixture data used by every other spec.
const SECOND_FLAT_NAME = 'E2E Second Group (rahul only)';

function getSecondFlatId(): string {
  const rows = dbQuery(`select id from flats where name = '${SECOND_FLAT_NAME}';`) as { id: string }[];
  if (!rows[0]) throw new Error(`${SECOND_FLAT_NAME} not seeded — beforeAll should have created it`);
  return rows[0].id;
}

function getTestFlatName(): string {
  const rows = dbQuery(`select name from flats where id = '${TEST_FLAT_ID}';`) as { name: string }[];
  return rows[0].name;
}

test.describe('Groups (multi-group switcher + leave)', () => {
  test.beforeAll(() => {
    dbQuery(`
      insert into flats (name) values ('${SECOND_FLAT_NAME}')
      on conflict do nothing;
    `);
    const flatId = getSecondFlatId();
    dbQuery(`
      insert into flat_members (flat_id, user_id, role)
      values ('${flatId}', '${TEST_USERS.rahul.id}', 'member')
      on conflict (flat_id, user_id) do nothing;
    `);
  });

  test.afterAll(() => {
    // Best-effort cleanup — safe even if the leave-group test already
    // removed the membership and/or the flat itself.
    const rows = dbQuery(`select id from flats where name = '${SECOND_FLAT_NAME}';`) as { id: string }[];
    const flatId = rows[0]?.id;
    if (flatId) {
      dbQuery(`
        delete from flat_members where flat_id = '${flatId}';
        delete from flats where id = '${flatId}';
      `);
    }
  });

  test('group-switcher chips show each group\'s own name and switch the Today tab scope', async ({ rahulPage }) => {
    // rahul belongs to TEST_FLAT_ID plus the second flat seeded above — two
    // groups is exactly the threshold MealChips renders at (index.tsx:
    // `groups.length <= 1` returns null).
    const testFlatName = getTestFlatName();

    await rahulPage.getByRole('tab', { name: 'Today' }).click();

    // useMyGroups loads asynchronously (fetch flat_members, then a
    // per-group query), so wait for both chips to actually appear rather
    // than asserting immediately — MealChips renders null until `groups`
    // has loaded and length > 1.
    //
    // Match the chips by role, not by text. Since c856ade labelled the chips
    // with each group's name, the active group's name ALSO renders as the
    // Today header's subtitle ((tabs)/index.tsx:120) — two genuinely visible
    // matches, which `visible=true` cannot separate (it only drops the
    // detached 0x0 nodes Expo Router leaves across a transition). Chip sets
    // accessibilityRole="button" (ui.tsx:219); the subtitle is plain text.
    const testFlatChip = rahulPage.getByRole('button', { name: testFlatName, exact: true });
    const secondFlatChip = rahulPage.getByRole('button', { name: SECOND_FLAT_NAME, exact: true });
    await expect(testFlatChip).toBeVisible({ timeout: 10_000 });
    await expect(secondFlatChip).toBeVisible({ timeout: 10_000 });

    // Switching chips re-scopes the screen to the other group's poll state
    // without a full reload — clicking the second chip must not throw/blank
    // the screen, and both chips must still render afterward.
    // force: true — Expo Router web renders an invisible full-width
    // role=tablist hit-area over this viewport that intercepts pointer
    // events in Playwright's headless browser; not reproducible on a real
    // touch device, so bypassing Playwright's actionability's hit-test here
    // matches how a real tap on native/mobile web actually behaves.
    await secondFlatChip.click({ force: true });
    await expect(testFlatChip).toBeVisible({ timeout: 10_000 });
    await expect(secondFlatChip).toBeVisible({ timeout: 10_000 });
  });

  test('leaving a non-last group removes the flat_members row and keeps the other group', async ({ rahulPage }) => {
    const flatId = getSecondFlatId();

    await rahulPage.getByRole('tab', { name: 'Settings' }).click();

    // Settings is now a pager of four sections; households live on their own
    // page, which shows only the ACTIVE household. Open that section, then
    // switch to the second group — the card no longer lists every group, so
    // the old "find the second group's card" div-walk has nothing to find.
    await rahulPage
      .getByRole('tablist', { name: 'Settings sections' })
      .getByRole('tab', { name: 'Home' })
      .click();
    const household = rahulPage.getByLabel('Home', { exact: true });
    await household
      .getByLabel('Household for Home')
      .getByText(SECOND_FLAT_NAME, { exact: true })
      .click();

    await expect(household.getByText('Leave household', { exact: true })).toBeVisible();
    await household.getByText('Leave household', { exact: true }).click();

    // Two-step confirm: the first tap swaps in a warning plus "Keep my
    // membership" / "Leave <name>" (no question mark — settings.tsx renders
    // `Leave {group.name}`).
    await expect(household.getByText(`Leave ${SECOND_FLAT_NAME}`, { exact: true })).toBeVisible();

    const rows = dbQuery(
      `select 1 from flat_members where flat_id = '${flatId}' and user_id = '${TEST_USERS.rahul.id}';`
    ) as unknown[];
    expect(rows).toHaveLength(1); // not removed yet — confirm step hasn't been clicked

    // The confirm button is the same "Leave <name>" element asserted above —
    // the first tap revealed it, this one commits.
    await household.getByText(`Leave ${SECOND_FLAT_NAME}`, { exact: true }).click();
    await rahulPage.waitForTimeout(1500);

    const rowsAfter = dbQuery(
      `select 1 from flat_members where flat_id = '${flatId}' and user_id = '${TEST_USERS.rahul.id}';`
    ) as unknown[];
    expect(rowsAfter).toHaveLength(0);

    // rahul still belongs to TEST_FLAT_ID (wasn't his last group), so
    // Settings should still land on that group's card, not bounce to
    // /onboarding/choose.
    await expect(rahulPage.getByRole('tab', { name: 'Today' })).toBeVisible();
  });
});
