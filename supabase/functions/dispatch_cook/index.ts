// dispatch_cook — runs every 15 min via pg_cron; for each ACTIVE MEAL whose
// dispatch moment (serve_time minus dispatch_offset_min, on a candidate
// serving date) falls in this window and has a 'closed' poll, composes and
// sends the cook's WhatsApp message. A flat has one active cook, so a flat
// with several meals sends that cook one message per meal per day.
//
// Pipeline (docs/06-whatsapp-integration.md "Composition pipeline",
// docs/04-architecture.md "Sequence: dispatch_cook"):
//   1. Load the locked cart (cart_items) — every line is a dish + its own
//      quantity, decided together by the flat. Recompute headcount from
//      day_attendance (out-toggles count as of now) — informational only
//      now, no longer an ingredient-scaling multiplier.
//   2. Scale EACH dish's recipe_ingredients by ITS OWN cart line quantity,
//      not by flat headcount.
//   3. Compose English payload (per-dish sections, flat_note).
//   4. Translation: read recipe_translations(recipe_id, cook.language) if
//      present; else call Google Translate and insert with
//      reviewed_at = null (flagged for human review), once per dish. flat_note
//      is always live-translated (short, dynamic, never cached). If no
//      translation is cached AND GOOGLE_TRANSLATE_API_KEY is unset, falls
//      back to the English payload rather than blocking dispatch.
//   5. Fill WhatsApp template variables, call BSP send API — unless
//      DISPATCH_MODE=mock, which skips the network call and logs
//      status='mocked' instead. This must work end-to-end before Meta
//      template approval lands. Live BSP send is not implemented (no BSP
//      account provisioned yet) — mode='live' logs status='failed'.
//   6. Insert dispatch_log row; wa_webhook updates status afterwards.

import { createAdminClient } from '../_shared/supabase-admin.ts';
import {
  eventMomentIst,
  istDateString,
  istDateStringOffset,
  isMomentDue,
  nowInIst,
} from '../_shared/ist-time.ts';
import { fetchActiveFlatMeals, type FlatMealRow } from '../_shared/flat-meals.ts';
import { logPipelineError, serializeError } from '../_shared/pipeline-errors.ts';
import {
  composeEnglishPayload,
  composeMealHeading,
  type DishLine,
  type RecipeIngredientRow,
} from './compose-payload.ts';
import { translateText } from './translate.ts';

type DispatchMode = 'mock' | 'live';

// A meal can be dispatched the evening before it is served, so today's and
// tomorrow's servings are both candidates each tick (mirrors create_poll).
const CANDIDATE_DAY_OFFSETS = [0, 1];

// A late dispatch is worse than a missed one — the cook may have already
// shopped or started — so catch-up is bounded to roughly two ticks rather
// than isMomentDue's 24h default. Long enough to survive a single failed
// cron run, short enough that nothing arrives meaningfully late.
const DISPATCH_GRACE_MINUTES = 45;

Deno.serve(async (_req) => {
  const admin = createAdminClient();
  const nowIst = nowInIst();
  const dispatchMode = (Deno.env.get('DISPATCH_MODE') as DispatchMode) ?? 'mock';

  let meals: FlatMealRow[];
  try {
    meals = await fetchActiveFlatMeals(admin);
  } catch (err) {
    await logPipelineError(admin, 'dispatch_cook', serializeError(err));
    return new Response(JSON.stringify({ error: serializeError(err).message }), { status: 500 });
  }

  const todayIst = istDateString(nowIst);
  const due: { meal: FlatMealRow; pollDate: string }[] = [];
  for (const meal of meals) {
    for (const dayOffset of CANDIDATE_DAY_OFFSETS) {
      const pollDate = istDateStringOffset(nowIst, dayOffset);
      const dispatchMoment = eventMomentIst(pollDate, meal.serve_time, meal.dispatch_offset_min);
      // Latched like create_poll so a missed tick still reaches the cook, but
      // with a far shorter grace: a message arriving hours late is worse than
      // none, because the cook may have already shopped or started. Never
      // dispatch past the serve time itself. dispatchForMeal only acts on a
      // 'closed' poll and flips it to 'dispatched', so the repeat is a no-op.
      if (!isMomentDue(dispatchMoment, nowIst, DISPATCH_GRACE_MINUTES)) continue;
      const serveMoment = eventMomentIst(pollDate, meal.serve_time, 0);
      if (nowIst.getTime() >= serveMoment.getTime()) continue;
      due.push({ meal, pollDate });
    }
  }

  const results = await Promise.all(
    due.map(({ meal, pollDate }) => dispatchForMeal(admin, meal, pollDate, todayIst, dispatchMode))
  );

  const failures = results.filter((ok) => !ok).length;
  return new Response(
    JSON.stringify({ processed: due.length, failures, mode: dispatchMode }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});

async function dispatchForMeal(
  admin: ReturnType<typeof createAdminClient>,
  meal: FlatMealRow,
  pollDate: string,
  todayIst: string,
  mode: DispatchMode
): Promise<boolean> {
  const flatId = meal.flat_id;
  try {
    // Exact resolution by the unique key — same tie-break bug as close_poll:
    // "latest closed poll for this flat" picked arbitrarily between two meals
    // sharing a date, so one meal's cart could be sent under another's name.
    const { data: poll, error: pollError } = await admin
      .from('daily_polls')
      .select('id, poll_date, flat_note')
      .eq('flat_id', flatId)
      .eq('poll_date', pollDate)
      .eq('flat_meal_id', meal.id)
      .eq('status', 'closed')
      .maybeSingle();

    if (pollError) throw pollError;
    if (!poll) return true; // nothing to dispatch for this meal (idempotent)

    const { data: cook } = await admin
      .from('cooks')
      .select('name, phone, language')
      .eq('flat_id', flatId)
      .eq('is_active', true)
      .maybeSingle();

    if (!cook) {
      await logPipelineError(admin, 'dispatch_cook', { message: 'no active cook for flat' }, flatId);
      return false;
    }

    const { data: cartRows, error: cartError } = await admin
      .from('cart_items')
      .select('recipe_id, quantity, recipes(name, kind, instructions_en)')
      .eq('poll_id', poll.id);
    if (cartError) throw cartError;

    if (!cartRows || cartRows.length === 0) {
      await logPipelineError(
        admin,
        'dispatch_cook',
        { message: 'empty cart at dispatch time', meal: meal.name },
        flatId
      );
      return false;
    }

    // Mains first, then accompaniments, then sides, mirroring the "list
    // dishes with their own headcounts" composition order (docs/06 decision
    // #6). All three kinds must be included here — a cart line whose
    // recipe.kind isn't explicitly bucketed would silently vanish from the
    // cook's message despite being in the customer-facing cart.
    const mains = cartRows.filter((r) => r.recipes?.kind === 'main');
    const accompaniments = cartRows.filter((r) => r.recipes?.kind === 'accompaniment');
    const sides = cartRows.filter((r) => r.recipes?.kind === 'side');
    const orderedCartRows = [...mains, ...accompaniments, ...sides];
    const cartRecipeIds = orderedCartRows.map((r) => r.recipe_id);

    const [{ data: memberRows }, { data: attendanceRows }, { data: allIngredientRows }] = await Promise.all([
      admin.from('flat_members').select('user_id').eq('flat_id', flatId),
      // Scoped to this meal: being out for breakfast must not shrink the
      // dinner headcount.
      admin
        .from('day_attendance')
        .select('user_id, is_out')
        .eq('flat_id', flatId)
        .eq('poll_date', poll.poll_date)
        .eq('flat_meal_id', meal.id),
      admin
        .from('recipe_ingredients')
        .select('recipe_id, name_en, name_hi, name_kn, qty_per_person, unit, is_staple, sort_order')
        .in('recipe_id', cartRecipeIds)
        .order('sort_order'),
    ]);

    // Informational only now (dispatch_log metadata + preview text) — no
    // longer an ingredient-scaling multiplier. Each dish scales by its own
    // cart line quantity instead (decision #6's key architectural inversion).
    const outUserIds = new Set((attendanceRows ?? []).filter((a) => a.is_out).map((a) => a.user_id));
    const headcount = Math.max((memberRows ?? []).length - outUserIds.size, 0);

    const ingredientsByRecipe = new Map<string, RecipeIngredientRow[]>();
    for (const row of allIngredientRows ?? []) {
      const list = ingredientsByRecipe.get(row.recipe_id) ?? [];
      list.push(row);
      ingredientsByRecipe.set(row.recipe_id, list);
    }

    const dishes: DishLine[] = orderedCartRows.map((row) => ({
      recipeId: row.recipe_id,
      name: row.recipes?.name ?? 'dish',
      quantity: row.quantity,
      instructions: row.recipes?.instructions_en ?? '',
      ingredients: ingredientsByRecipe.get(row.recipe_id) ?? [],
    }));

    // Step 3: English payload (per-dish sections + flat note) — this is the
    // in-app preview shape, not constrained by the WhatsApp template's slots.
    const payloadEn = composeEnglishPayload({
      dishes,
      flatNote: poll.flat_note,
      meal: { name: meal.name, serveTime: meal.serve_time },
      pollDate: poll.poll_date,
      todayIst,
    });

    // Step 4: translation — cached recipe_translations first; else live
    // Google Translate (flagged reviewed_at=null) if a key is configured;
    // else fall back to English so dispatch is never blocked on it.
    const payloadTranslated = await composeTranslatedPayload({
      dishes,
      headcount,
      language: cook.language as 'hi' | 'kn' | 'en',
      flatNote: poll.flat_note,
      heading: composeMealHeading(meal.name, meal.serve_time, poll.poll_date, todayIst),
      fallback: payloadEn,
    });

    let status: 'mocked' | 'sent' | 'failed' = 'mocked';
    let bspMessageId: string | null = null;
    let error: string | null = null;

    if (mode === 'live') {
      // No BSP account provisioned yet (docs/06-whatsapp-integration.md
      // "Setup" is a manual, day-1 prerequisite not yet done) — live send
      // cannot succeed until a BSP API key/account exists.
      status = 'failed';
      error = 'live dispatch not yet implemented — no BSP account configured';
    }

    await admin.from('dispatch_log').insert({
      poll_id: poll.id,
      mode,
      language: cook.language,
      headcount,
      payload_en: payloadEn,
      payload_translated: payloadTranslated,
      bsp_message_id: bspMessageId,
      status,
      error,
    });

    await admin.from('daily_polls').update({ status: 'dispatched' }).eq('id', poll.id);
    return true;
  } catch (err) {
    await logPipelineError(admin, 'dispatch_cook', serializeError(err), flatId);
    return false;
  }
}

// Concise message with the household note translated when available.
async function composeTranslatedPayload(
  params: {
    dishes: DishLine[];
    headcount: number;
    language: 'hi' | 'kn' | 'en';
    flatNote: string | null;
    heading: string;
    fallback: string;
  }
): Promise<string> {
  const { dishes, language, flatNote, heading, fallback } = params;

  if (language === 'en') return fallback;

  const translatedNote = flatNote?.trim() ? await translateText(flatNote.trim(), language) : null;
  const dishSummary = dishes.map((d) => `${d.name} (for ${d.quantity})`).join(', ');
  const note = translatedNote ?? flatNote?.trim();
  return [`${heading}: ${dishSummary}`, ...(note ? [`Note: ${note}`] : [])].join('\n\n');
}
