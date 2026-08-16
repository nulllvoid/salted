// The due-latch (part 2, _shared/ist-time.ts isMomentDue) deliberately keeps
// a stage due for a 24h grace window so a missed cron tick is recovered
// rather than lost for the day. The side effect is that a flat which can
// NEVER succeed — no members, so no diet profile, so no poll — is retried on
// every 15-minute tick and logs an identical error each time. On 2026-08-16
// that produced 52 rows from 5 abandoned flats.
//
// This throttles the log line without touching the latch: the condition is
// real and must stay visible, but once every few hours is enough to notice a
// misconfigured flat, and 96 times a day is enough to bury everything else.
//
// Deliberately time-bucketed rather than stateful: Edge Function instances
// are ephemeral and there is no shared memory between invocations, so a
// module-level Set would reset unpredictably. Bucketing the clock gives the
// same answer from any instance with no state at all.
//
// Buckets are measured from IST MIDNIGHT, not from the Unix epoch. An epoch
// bucket of 6h falls at 00:00/06:00/12:00/18:00 UTC, which — because these
// Dates carry IST wall-clock in their UTC fields (see _shared/ist-time.ts) —
// puts 09:00 IST three hours into a bucket and silences it forever. Anchoring
// on midnight makes the boundaries the readable IST times they look like.
export function shouldLogMissingMembers(
  flatId: string,
  pollDate: string,
  nowIst: Date,
  throttleMinutes = 6 * 60
): boolean {
  // flatId and pollDate are not used to compute the answer. They are in the
  // signature to document that callers ask per (flat, date) pair, and so a
  // future stateful implementation can key on them without a call-site change.
  void flatId;
  void pollDate;
  const minutesSinceMidnight = nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();
  // pg_cron fires every 15 minutes, so "the first tick of the bucket" is
  // anything in its first 15 minutes.
  return minutesSinceMidnight % throttleMinutes < 15;
}
