// create_poll — runs every 15 min via pg_cron; for each ACTIVE MEAL whose
// open moment has arrived, generates that meal's suggestion list: up to 3
// main-course suggestions and (for full meals) up to 3 accompaniment
// suggestions. These are offers, not a ballot — flatmates build a shared
// cart by tapping suggestions (see app/src/hooks/use-today-cart.ts), they
// don't vote. Selection logic (dietary veto, basis filter, 10-day exclusion,
// variety heuristic, seeded shuffle) lives in select-options.ts.
//
// The scheduling unit is flat_meals, not flats: a flat serving breakfast and
// dinner gets two independent polls a day, each on its own times. A meal's
// poll can open on the day BEFORE it is served (open_offset_min may exceed
// 1440), so the open moment is computed backwards from the serve time and
// both today's and tomorrow's servings are considered each tick.

import { fetchMemberDietProfiles } from '../_shared/flat-members.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import {
  eventMomentIst,
  istDateStringOffset,
  isMomentDue,
  nowInIst,
} from '../_shared/ist-time.ts';
import { fetchActiveFlatMeals, type FlatMealRow } from '../_shared/flat-meals.ts';
import { logPipelineError, serializeError } from '../_shared/pipeline-errors.ts';
import { selectAccompanimentOptionsForSuggestedMains, selectPollOptions } from './select-options.ts';

const RECENT_DAYS_EXCLUSION = 10;
// A meal's poll can open on the day before it is served (open_offset_min may
// exceed 1440), so "what is due right now" must consider tomorrow's servings
// too. Two days bounds the scan for any offset up to 48h; part 3 rejects
// larger offsets at write time.
const CANDIDATE_DAY_OFFSETS = [0, 1];

Deno.serve(async (_req) => {
  const admin = createAdminClient();
  const nowIst = nowInIst();

  let meals: FlatMealRow[];
  try {
    meals = await fetchActiveFlatMeals(admin);
  } catch (err) {
    await logPipelineError(admin, 'create_poll', serializeError(err));
    return new Response(JSON.stringify({ error: serializeError(err).message }), { status: 500 });
  }

  // Each (meal, serving date) pair is scheduled independently: the open
  // moment is computed backwards from the serve time, so a breakfast served
  // tomorrow can open this evening.
  //
  // isMomentDue, not isMomentInCronWindow: a poll whose open moment was
  // missed by its one matching tick — a failed cron run, or a poll time
  // edited past the current window — must still be created on a later tick
  // rather than lost for the day. createPollForMeal's existing
  // (flat_id, poll_date, flat_meal_id) probe makes the repeat a no-op.
  const due: { meal: FlatMealRow; pollDate: string }[] = [];
  for (const meal of meals) {
    for (const dayOffset of CANDIDATE_DAY_OFFSETS) {
      const pollDate = istDateStringOffset(nowIst, dayOffset);
      const openMoment = eventMomentIst(pollDate, meal.serve_time, meal.open_offset_min);
      if (!isMomentDue(openMoment, nowIst)) continue;
      // Never open a cart that is already past its own close time — catching
      // up after a long outage must not produce a poll nobody can use and
      // close_poll's window will never match. This bounds the latch far more
      // tightly than graceMinutes does for a meal closing the same day.
      const closeMoment = eventMomentIst(pollDate, meal.close_time, 0);
      if (nowIst.getTime() >= closeMoment.getTime()) continue;
      due.push({ meal, pollDate });
    }
  }

  const results = await Promise.all(
    due.map(({ meal, pollDate }) => createPollForMeal(admin, meal, pollDate))
  );

  // Caught per-meal failures are counted, not just logged. During part 1 this
  // function failed on every run for minutes while still returning
  // {"processed":1,"failures":0} — a green response body that proved nothing.
  const failures = results.filter((ok) => !ok).length;
  return new Response(JSON.stringify({ processed: due.length, failures }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// Returns false if this meal's poll failed, so the handler's `failures` tally
// reflects reality. A legitimate no-op (already exists) returns true.
async function createPollForMeal(
  admin: ReturnType<typeof createAdminClient>,
  meal: FlatMealRow,
  pollDate: string
): Promise<boolean> {
  const flatId = meal.flat_id;
  try {
    // Idempotent via unique (flat_id, poll_date, flat_meal_id) — a re-run in
    // the same 15-minute tick is a no-op.
    const { data: existing, error: existingError } = await admin
      .from('daily_polls')
      .select('id')
      .eq('flat_id', flatId)
      .eq('poll_date', pollDate)
      .eq('flat_meal_id', meal.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return true;

    const members = await fetchMemberDietProfiles(admin, flatId);
    if (members.length === 0) {
      await logPipelineError(admin, 'create_poll', { message: 'flat has no members' }, flatId);
      return false;
    }

    const { data: recipes, error: recipesError } = await admin
      .from('recipes')
      .select('id, cuisine, base, diet_class, jain_ok, allergens, suitable_bases')
      .eq('is_active', true)
      .eq('kind', 'main');
    if (recipesError) throw recipesError;

    // The 10-day no-repeat rule is scoped to meals sharing this basis. Flat-wide
    // scoping would let Monday's poha suppress it across the next ten
    // BREAKFASTS while leaving dinner untouched, and with a small breakfast
    // pool that exhausts the pool within days.
    //
    // Deliberately two queries rather than one with a two-level embedded
    // filter (`daily_polls.flat_meals.basis`). That nested form could not be
    // verified from this environment — the anon key is RLS-blocked on
    // cart_items — and its failure mode is silent: an unscoped or empty
    // exclusion set surfaces only as repeated or over-suppressed suggestions
    // days later. This form uses only single-level embedding, which the
    // existing code already relied on.
    const { data: basisMeals, error: basisMealsError } = await admin
      .from('flat_meals')
      .select('id')
      .eq('flat_id', flatId)
      .eq('basis', meal.basis);
    if (basisMealsError) throw basisMealsError;
    const basisMealIds = (basisMeals ?? []).map((m) => m.id);

    const cutoffDate = new Date(pollDate);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - RECENT_DAYS_EXCLUSION);
    const { data: recentCartRows, error: recentError } = await admin
      .from('cart_items')
      .select('recipe_id, daily_polls!inner(flat_id, status, poll_date, flat_meal_id)')
      .eq('daily_polls.flat_id', flatId)
      .eq('daily_polls.status', 'dispatched')
      .in('daily_polls.flat_meal_id', basisMealIds)
      .gte('daily_polls.poll_date', cutoffDate.toISOString().slice(0, 10));
    if (recentError) throw recentError;

    const recentlyServedRecipeIds = new Set((recentCartRows ?? []).map((row) => row.recipe_id));

    const memberDiets = members.map((m) => ({
      diet_type: m.diet_type,
      is_jain: m.is_jain,
      allergies: m.allergies,
    }));

    const selectedRecipeIds = selectPollOptions({
      flatId,
      pollDate,
      flatMealId: meal.id,
      basis: meal.basis,
      members: memberDiets,
      eligibleRecipes: (recipes ?? []).map((r) => ({
        id: r.id,
        cuisine: r.cuisine,
        base: r.base,
        diet_class: r.diet_class,
        jain_ok: r.jain_ok,
        allergens: r.allergens,
        suitable_bases: r.suitable_bases ?? [],
      })),
      recentlyServedRecipeIds,
    });

    if (selectedRecipeIds.length === 0) {
      await logPipelineError(
        admin,
        'create_poll',
        {
          message: 'no eligible recipes for flat dietary constraints',
          basis: meal.basis,
          meal: meal.name,
        },
        flatId
      );
      return false;
    }

    const { data: poll, error: pollError } = await admin
      .from('daily_polls')
      .insert({ flat_id: flatId, flat_meal_id: meal.id, poll_date: pollDate, status: 'open' })
      .select('id')
      .single();
    if (pollError) throw pollError;

    const { error: optionsError } = await admin.from('poll_options').insert(
      selectedRecipeIds.map((recipeId, index) => ({
        poll_id: poll.id,
        recipe_id: recipeId,
        position: index + 1,
      }))
    );
    if (optionsError) throw optionsError;

    // Accompaniments (roti/rice pairing) are a full-meal concept — nobody
    // orders a side of roti with their poha — so breakfast and light meals
    // seed mains only.
    if (meal.basis === 'full') {
      const accompanimentRecipeIds = await selectAccompanimentOptionsForSuggestedMains(admin, {
        flatId,
        pollDate,
        flatMealId: meal.id,
        suggestedMainRecipeIds: selectedRecipeIds,
        members: memberDiets,
      });

      if (accompanimentRecipeIds.length > 0) {
        const { error: accError } = await admin.from('poll_accompaniment_options').insert(
          accompanimentRecipeIds.map((recipeId, index) => ({
            poll_id: poll.id,
            recipe_id: recipeId,
            position: index + 1,
          }))
        );
        if (accError) throw accError;
      }
    }

    // TODO: push notification "Today's suggestions are up — add to the cart."
    return true;
  } catch (err) {
    await logPipelineError(admin, 'create_poll', serializeError(err), flatId);
    return false;
  }
}
