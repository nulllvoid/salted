import { dbQuery } from './db';
import { TEST_FLAT_ID } from './test-users';
import { todayIst } from './poll-state';

// Seeds a real 'open' poll for today with the given main-dish slugs as
// options — a lighter-weight alternative to invoking create_poll's full
// selection heuristic when a test only cares about voting/tally behavior
// on a known, fixed set of options. Tests that specifically exercise
// create_poll's own selection logic (dietary veto, variety, exclusion) call
// triggerCreatePoll from poll-state.ts instead and inspect what it actually
// picked.
// Resolves the flat's default (first, by position) meal. The per-meal
// migration backfills every existing flat to exactly one 'Dinner' meal, so
// tests that don't care about meals keep the single-poll behavior they had
// before it landed.
function defaultMealIdSql(flatId: string): string {
  return `(select id from flat_meals where flat_id = '${flatId}' and is_active order by position, created_at limit 1)`;
}

export function seedOpenPoll(dishSlugs: string[], flatId: string = TEST_FLAT_ID, date: string = todayIst()) {
  dbQuery(`
    insert into daily_polls (flat_id, flat_meal_id, poll_date, status)
    values ('${flatId}', ${defaultMealIdSql(flatId)}, '${date}', 'open')
    on conflict (flat_id, poll_date, flat_meal_id) do update set status = 'open';

    insert into poll_options (poll_id, recipe_id, position)
    select dp.id, r.id, v.position
    from (values ${dishSlugs.map((slug, i) => `('${slug}', ${i + 1})`).join(', ')}) as v(slug, position)
    join daily_polls dp on dp.flat_id = '${flatId}' and dp.poll_date = '${date}'
    join recipes r on r.slug = v.slug
    on conflict (poll_id, recipe_id) do nothing;
  `);
}

// Seeds a poll_accompaniment_options row directly — used by tests that only
// care about the cart/lock behavior downstream of accompaniment suggestions
// existing, not about create_poll's own union-of-recipe_accompaniments
// sourcing logic (which has its own coverage via triggerCreatePoll).
export function seedAccompanimentSuggestion(
  accompanimentSlug: string,
  position = 1,
  flatId: string = TEST_FLAT_ID,
  date: string = todayIst()
) {
  dbQuery(`
    insert into poll_accompaniment_options (poll_id, recipe_id, position)
    select dp.id, r.id, ${position}
    from daily_polls dp, recipes r
    where dp.flat_id = '${flatId}' and dp.poll_date = '${date}' and r.slug = '${accompanimentSlug}'
    on conflict (poll_id, recipe_id) do nothing;
  `);
}

// Adds a dish straight to the shared cart at the given quantity — the
// server-side equivalent of a flatmate tapping a suggestion then adjusting
// the stepper. Any flat member can add/edit any line (shared cart, not
// per-user votes), so `userId` here only sets added_by/updated_by
// attribution, not row identity.
export function addToCartAsUser(
  userId: string,
  dishSlug: string,
  quantity = 1,
  flatId: string = TEST_FLAT_ID,
  date: string = todayIst()
) {
  dbQuery(`
    insert into cart_items (poll_id, recipe_id, quantity, added_by, updated_by)
    select dp.id, r.id, ${quantity}, '${userId}', '${userId}'
    from daily_polls dp, recipes r
    where dp.flat_id = '${flatId}' and dp.poll_date = '${date}' and r.slug = '${dishSlug}'
    on conflict (poll_id, recipe_id) do update set quantity = excluded.quantity, updated_by = excluded.updated_by, updated_at = now();
  `);
}
