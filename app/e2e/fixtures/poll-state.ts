import { dbQuery } from './db';
import { TEST_FLAT_ID } from './test-users';

const FUNCTIONS_BASE = 'https://pcmtsfcjzoivagpslpch.supabase.co/functions/v1';

// Mirrors supabase/functions/_shared/ist-time.ts's offset — the Edge
// Functions gate on IST time-of-day, so tests that want a function to
// actually act on TEST_FLAT_ID must first move the relevant flat.* time
// column into the current 15-minute window.
function currentIstHHMM(): string {
  const IST_OFFSET_MINUTES = 5 * 60 + 30;
  const ist = new Date(Date.now() + IST_OFFSET_MINUTES * 60_000);
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

function currentIstDateString(): string {
  const IST_OFFSET_MINUTES = 5 * 60 + 30;
  const ist = new Date(Date.now() + IST_OFFSET_MINUTES * 60_000);
  return ist.toISOString().slice(0, 10);
}

export function todayIst(): string {
  return currentIstDateString();
}

async function invoke(fnName: 'create_poll' | 'close_poll' | 'dispatch_cook'): Promise<{ processed: number; failures: number }> {
  const res = await fetch(`${FUNCTIONS_BASE}/${fnName}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`${fnName} returned HTTP ${res.status}`);
  return res.json();
}

// Sets the flat's poll_open_time to "now" (IST) and invokes create_poll,
// same technique used manually throughout the feature-build session — the
// function only acts on flats whose configured time falls in the current
// 15-minute window.
export async function triggerCreatePoll(flatId: string = TEST_FLAT_ID) {
  dbQuery(`update flats set poll_open_time = '${currentIstHHMM()}' where id = '${flatId}';`);
  return invoke('create_poll');
}

export async function triggerClosePoll(flatId: string = TEST_FLAT_ID) {
  dbQuery(`update flats set poll_close_time = '${currentIstHHMM()}' where id = '${flatId}';`);
  return invoke('close_poll');
}

export async function triggerDispatchCook(flatId: string = TEST_FLAT_ID) {
  dbQuery(`update flats set dispatch_time = '${currentIstHHMM()}' where id = '${flatId}';`);
  return invoke('dispatch_cook');
}

// Full clean slate for TEST_FLAT_ID's poll on `date` (default: today IST) —
// removes everything a prior test run may have left behind across every
// table touched by the daily pipeline, then resets flat.* timing columns
// back to spec defaults so an unrelated test isn't accidentally put in a
// cron window.
export async function resetPollState(flatId: string = TEST_FLAT_ID, date: string = todayIst()) {
  dbQuery(`
    delete from dispatch_log where poll_id in (select id from daily_polls where flat_id = '${flatId}' and poll_date = '${date}');
    delete from grocery_checks where poll_id in (select id from daily_polls where flat_id = '${flatId}' and poll_date = '${date}');
    delete from cart_items where poll_id in (select id from daily_polls where flat_id = '${flatId}' and poll_date = '${date}');
    delete from poll_accompaniment_options where poll_id in (select id from daily_polls where flat_id = '${flatId}' and poll_date = '${date}');
    delete from poll_options where poll_id in (select id from daily_polls where flat_id = '${flatId}' and poll_date = '${date}');
    delete from day_attendance where flat_id = '${flatId}' and poll_date = '${date}';
    delete from daily_polls where flat_id = '${flatId}' and poll_date = '${date}';
    update flats set poll_open_time = '09:00:00', poll_close_time = '11:00:00', dispatch_time = '16:00:00' where id = '${flatId}';
  `);
}

// Returns the flat's first meal's poll for the date. The order-by is load
// bearing now that a flat can run several meals on one date: rows[0] of an
// unordered result is not a choice. Tests needing a specific meal's poll
// should query by flat_meal_id directly.
export function getPollForDate(flatId: string = TEST_FLAT_ID, date: string = todayIst()) {
  const rows = dbQuery(
    `select dp.id, dp.status from daily_polls dp
     join flat_meals m on m.id = dp.flat_meal_id
     where dp.flat_id = '${flatId}' and dp.poll_date = '${date}'
     order by m.position, m.created_at limit 1;`
  ) as Record<string, unknown>[];
  return rows[0] ?? null;
}
