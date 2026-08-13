// create_poll — runs every 15 min via pg_cron; for each flat whose
// poll_open_time falls in this window, generates today's suggestion list:
// up to 3 main-course suggestions and up to 3 accompaniment suggestions.
// These are offers, not a ballot — flatmates build a shared cart by tapping
// suggestions (see app/src/hooks/use-today-cart.ts), they don't vote.
// Selection logic (dietary veto, 10-day exclusion, variety heuristic,
// seeded shuffle) lives in select-options.ts.

import { fetchMemberDietProfiles } from '../_shared/flat-members.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { istDateString, isWithinCronWindow, nowInIst } from '../_shared/ist-time.ts';
import { logPipelineError } from '../_shared/pipeline-errors.ts';
import { selectAccompanimentOptionsForSuggestedMains, selectPollOptions } from './select-options.ts';

const RECENT_DAYS_EXCLUSION = 10;

Deno.serve(async (_req) => {
  const admin = createAdminClient();
  const nowIst = nowInIst();
  const pollDate = istDateString(nowIst);

  const { data: flats, error: flatsError } = await admin
    .from('flats')
    .select('id, poll_open_time');

  if (flatsError) {
    await logPipelineError(admin, 'create_poll', { message: flatsError.message });
    return new Response(JSON.stringify({ error: flatsError.message }), { status: 500 });
  }

  const dueFlats = (flats ?? []).filter((flat) => isWithinCronWindow(flat.poll_open_time, nowIst));

  const results = await Promise.allSettled(
    dueFlats.map((flat) => createPollForFlat(admin, flat.id, pollDate))
  );

  const failures = results.filter((r) => r.status === 'rejected').length;
  return new Response(JSON.stringify({ processed: dueFlats.length, failures }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function createPollForFlat(
  admin: ReturnType<typeof createAdminClient>,
  flatId: string,
  pollDate: string
) {
  try {
    // daily_polls.flat_meal_id is NOT NULL as of the per-meal migration, so
    // a poll must name the meal it belongs to. Until part 2 teaches this
    // function to iterate flat_meals and schedule each meal on its own
    // times, it targets the flat's first meal — which the migration's
    // backfill guarantees exists (one 'Dinner' row per flat), preserving
    // exactly one poll per flat per day.
    const { data: defaultMeal, error: mealError } = await admin
      .from('flat_meals')
      .select('id')
      .eq('flat_id', flatId)
      .eq('is_active', true)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (mealError) throw mealError;
    if (!defaultMeal) {
      await logPipelineError(admin, 'create_poll', { message: 'flat has no active meal' }, flatId);
      return;
    }

    // Idempotent: unique (flat_id, poll_date, flat_meal_id) means a re-run
    // is a no-op.
    const { data: existing } = await admin
      .from('daily_polls')
      .select('id')
      .eq('flat_id', flatId)
      .eq('poll_date', pollDate)
      .eq('flat_meal_id', defaultMeal.id)
      .maybeSingle();

    if (existing) return;

    const members = await fetchMemberDietProfiles(admin, flatId);

    if (members.length === 0) {
      await logPipelineError(admin, 'create_poll', { message: 'flat has no members' }, flatId);
      return;
    }

    const { data: recipes, error: recipesError } = await admin
      .from('recipes')
      .select('id, cuisine, base, diet_class, jain_ok, allergens')
      .eq('is_active', true)
      .eq('kind', 'main');
    if (recipesError) throw recipesError;

    const cutoffDate = new Date(pollDate);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - RECENT_DAYS_EXCLUSION);
    const { data: recentCartRows, error: recentError } = await admin
      .from('cart_items')
      .select('recipe_id, daily_polls!inner(flat_id, status, poll_date)')
      .eq('daily_polls.flat_id', flatId)
      .eq('daily_polls.status', 'dispatched')
      .gte('daily_polls.poll_date', cutoffDate.toISOString().slice(0, 10));
    if (recentError) throw recentError;

    const recentlyServedRecipeIds = new Set((recentCartRows ?? []).map((row) => row.recipe_id));

    const selectedRecipeIds = selectPollOptions({
      flatId,
      pollDate,
      members: members.map((m) => ({
        diet_type: m.diet_type,
        is_jain: m.is_jain,
        allergies: m.allergies,
      })),
      eligibleRecipes: (recipes ?? []).map((r) => ({
        id: r.id,
        cuisine: r.cuisine,
        base: r.base,
        diet_class: r.diet_class,
        jain_ok: r.jain_ok,
        allergens: r.allergens,
      })),
      recentlyServedRecipeIds,
    });

    if (selectedRecipeIds.length === 0) {
      await logPipelineError(
        admin,
        'create_poll',
        { message: 'no eligible recipes for flat dietary constraints' },
        flatId
      );
      return;
    }

    const { data: poll, error: pollError } = await admin
      .from('daily_polls')
      .insert({ flat_id: flatId, flat_meal_id: defaultMeal.id, poll_date: pollDate, status: 'open' })
      .select('id')
      .single();

    if (pollError) throw pollError;

    await admin.from('poll_options').insert(
      selectedRecipeIds.map((recipeId, index) => ({
        poll_id: poll.id,
        recipe_id: recipeId,
        position: index + 1,
      }))
    );

    // Accompaniment suggestions, sourced from the union of
    // recipe_accompaniments for today's suggested mains — see
    // select-options.ts's selectAccompanimentOptionsForSuggestedMains. Empty
    // result is a valid, non-error state (e.g. all suggested mains already
    // are the starch).
    const accompanimentRecipeIds = await selectAccompanimentOptionsForSuggestedMains(admin, {
      flatId,
      pollDate,
      suggestedMainRecipeIds: selectedRecipeIds,
      members: members.map((m) => ({
        diet_type: m.diet_type,
        is_jain: m.is_jain,
        allergies: m.allergies,
      })),
    });

    if (accompanimentRecipeIds.length > 0) {
      await admin.from('poll_accompaniment_options').insert(
        accompanimentRecipeIds.map((recipeId, index) => ({
          poll_id: poll.id,
          recipe_id: recipeId,
          position: index + 1,
        }))
      );
    }

    // TODO: push notification "Today's suggestions are up — add to the cart."
  } catch (err) {
    await logPipelineError(
      admin,
      'create_poll',
      { message: err instanceof Error ? err.message : String(err) },
      flatId
    );
  }
}
