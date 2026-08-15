// close_poll — runs every 15 min via pg_cron; for each ACTIVE MEAL whose
// close_time has arrived, locks that meal's cart for today. There is no
// winner to compute: mains and accompaniments are both just cart_items lines
// the flat built together during the open window. Locking is enforced at the
// RLS layer (cart_items writes require daily_polls.status = 'open') — the
// cart_items rows in place at this moment ARE the snapshot, no copy needed.
//
// Unlike create_poll and dispatch_cook, close_time is an absolute wall-clock
// time on the serving date rather than an offset, so only today is ever due.

import { createAdminClient } from '../_shared/supabase-admin.ts';
import { eventMomentIst, istDateString, isMomentDue, nowInIst } from '../_shared/ist-time.ts';
import { fetchActiveFlatMeals, type FlatMealRow } from '../_shared/flat-meals.ts';
import { logPipelineError, serializeError } from '../_shared/pipeline-errors.ts';

Deno.serve(async (_req) => {
  const admin = createAdminClient();
  const nowIst = nowInIst();
  const pollDate = istDateString(nowIst);

  let meals: FlatMealRow[];
  try {
    meals = await fetchActiveFlatMeals(admin);
  } catch (err) {
    await logPipelineError(admin, 'close_poll', serializeError(err));
    return new Response(JSON.stringify({ error: serializeError(err).message }), { status: 500 });
  }

  // Latched, not window-matched: a cart that misses its closing tick would
  // otherwise stay open indefinitely and never dispatch. closePollForMeal
  // scopes its update to status = 'open', so re-running is a no-op.
  const due = meals.filter((meal) =>
    isMomentDue(eventMomentIst(pollDate, meal.close_time, 0), nowIst)
  );

  const results = await Promise.all(due.map((meal) => closePollForMeal(admin, meal, pollDate)));

  const failures = results.filter((ok) => !ok).length;
  return new Response(JSON.stringify({ processed: due.length, failures }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function closePollForMeal(
  admin: ReturnType<typeof createAdminClient>,
  meal: FlatMealRow,
  pollDate: string
): Promise<boolean> {
  const flatId = meal.flat_id;
  try {
    // Resolved by (flat_id, poll_date, flat_meal_id) — the exact unique key.
    // The previous "latest open poll for this flat, ordered by poll_date" was
    // a TIE once two meals shared a date, and Postgres broke it arbitrarily:
    // closing breakfast could lock dinner's cart hours early.
    const { data: poll, error: pollError } = await admin
      .from('daily_polls')
      .select('id, poll_date, status')
      .eq('flat_id', flatId)
      .eq('poll_date', pollDate)
      .eq('flat_meal_id', meal.id)
      .eq('status', 'open')
      .maybeSingle();

    if (pollError) throw pollError;
    if (!poll) return true; // nothing open for this meal right now (idempotent)

    const [{ data: memberRows, error: memberError }, { data: attendanceRows, error: attendanceError }] =
      await Promise.all([
        admin.from('flat_members').select('user_id').eq('flat_id', flatId),
        // Scoped to this meal: being out for breakfast must not cancel dinner.
        admin
          .from('day_attendance')
          .select('user_id, is_out')
          .eq('flat_id', flatId)
          .eq('poll_date', poll.poll_date)
          .eq('flat_meal_id', meal.id),
      ]);
    if (memberError) throw memberError;
    if (attendanceError) throw attendanceError;

    const memberCount = (memberRows ?? []).length;
    const outCount = (attendanceRows ?? []).filter((a) => a.is_out).length;

    const nextStatus = memberCount > 0 && outCount >= memberCount ? 'cancelled' : 'closed';
    const { error: updateError } = await admin
      .from('daily_polls')
      .update({ status: nextStatus })
      .eq('id', poll.id);
    if (updateError) throw updateError;

    // TODO: push notification announcing tonight's locked cart to flat members.
    return true;
  } catch (err) {
    await logPipelineError(admin, 'close_poll', serializeError(err), flatId);
    return false;
  }
}
