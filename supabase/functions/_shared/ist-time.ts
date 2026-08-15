// All flat schedule columns (poll_open_time / poll_close_time / dispatch_time)
// are `time` values assumed Asia/Kolkata for v1 (docs/04-architecture.md).
// pg_cron fires this function every 15 minutes; each run selects flats whose
// local IST time-of-day matches (within the run's 15-minute window).

const IST_OFFSET_MINUTES = 5 * 60 + 30;

export function nowInIst(): Date {
  const now = new Date();
  return new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
}

export function istTimeOfDay(date: Date): string {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function istDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// True if `target` (a `time` column value, e.g. "09:00:00") falls within
// [windowStart, windowStart + windowMinutes) of `nowIst`'s time-of-day.
export function isWithinCronWindow(target: string, nowIst: Date, windowMinutes = 15): boolean {
  const [targetH, targetM] = target.split(':').map(Number);
  const targetMinutes = targetH * 60 + targetM;
  const nowMinutes = nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();
  return nowMinutes >= targetMinutes && nowMinutes < targetMinutes + windowMinutes;
}

// Per-meal scheduling (docs/superpowers/specs/2026-08-13-per-meal-polls-2-pipeline.md).
//
// The SERVING date is the anchor, never the date the poll opens. A meal
// served at 08:00 whose poll opens 14h earlier opens at 18:00 the PREVIOUS
// calendar day — computing the moment backwards from the serve time means
// midnight-crossing needs no special case at all, it just falls out of the
// arithmetic.
export function eventMomentIst(serveDate: string, serveTime: string, offsetMin: number): Date {
  const [y, m, d] = serveDate.split('-').map(Number);
  const [hh, mm] = serveTime.split(':').map(Number);
  const serveMoment = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(serveMoment - offsetMin * 60_000);
}

// YYYY-MM-DD for an IST date shifted by whole days. Used to build the
// candidate serving dates (today, tomorrow) that create_poll and
// dispatch_cook test against.
export function istDateStringOffset(nowIst: Date, dayOffset: number): string {
  const shifted = new Date(nowIst.getTime() + dayOffset * 86_400_000);
  return istDateString(shifted);
}

// True if an absolute moment falls in [nowIst, nowIst + windowMinutes).
// Distinct from isWithinCronWindow, which compares time-of-day only and so
// cannot express "opens tomorrow". Bounds match it exactly (inclusive start,
// exclusive end) so an event lands in exactly one 15-minute tick.
export function isMomentInCronWindow(moment: Date, nowIst: Date, windowMinutes = 15): boolean {
  const delta = moment.getTime() - nowIst.getTime();
  return delta >= 0 && delta < windowMinutes * 60_000;
}

// True once `moment` has arrived and for the rest of the serving window —
// "is this due yet?" rather than "is this due in exactly this tick?".
//
// Window matching loses work whenever the single matching tick is missed:
// a failed or delayed cron run, or a flat whose poll time is edited past
// the current window (change 09:00 to 09:10 at 09:20 and no tick ever
// matches again — that flat gets no poll at all that day). Callers pair
// this with their own already-done check — create_poll's existing
// (flat_id, poll_date, flat_meal_id) probe, dispatch_cook's poll status —
// so the latch is idempotent: due-and-not-done runs, due-and-done no-ops.
//
// `graceMinutes` bounds how stale an event may be before it is abandoned.
// Without it, a function restarted after a long outage would fire events
// from days ago; the default covers a same-day catch-up but not more.
export function isMomentDue(
  moment: Date,
  nowIst: Date,
  graceMinutes = 24 * 60
): boolean {
  const elapsed = nowIst.getTime() - moment.getTime();
  return elapsed >= 0 && elapsed < graceMinutes * 60_000;
}
