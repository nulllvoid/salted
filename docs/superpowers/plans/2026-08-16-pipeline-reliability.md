# Pipeline reliability and cleanup: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the operational gaps left open after part 2 shipped — a self-inflicted error-log flood, ~10% of cron ticks failing before the function body runs, and abandoned flats that can never produce a poll.

**Architecture:** Three independent fixes to the existing Edge Functions plus one data cleanup. No schema changes, no new tables, no app changes. Each task is separately revertible and separately deployable.

**Tech Stack:** Deno Edge Functions (TypeScript), Supabase JS v2, Postgres, pg_cron + pg_net. Tests run under the repo's existing Playwright unit project (`npm run test:unit` from `/app`) — no new dependency.

**Spec:** None. This plan is written directly from production evidence gathered on 2026-08-16 (queries and counts reproduced inline in each task). It is a follow-up to `docs/superpowers/plans/2026-08-13-per-meal-polls-2-pipeline.md`.

## Global Constraints

- **Live project.** Ref `pcmtsfcjzoivagpslpch`. There is no local/mock Supabase in this workflow. Every deploy is to production; 9 real flats run on it.
- **Deploy command, per function:** `npx supabase functions deploy <name> --project-ref pcmtsfcjzoivagpslpch`.
- **Deno is not installed.** No `deno test` / `deno check`. Unit tests run via `npm run test:unit` from `/app`; function type errors surface at deploy time.
- **The regression baseline is `schedule_matches = 9/9`** — for every flat, `poll_open_time = serve_time - open_offset_min`, `poll_close_time = close_time`, `dispatch_time = serve_time - dispatch_offset_min`. Re-assert it after any change touching scheduling. The query is in Task 4 Step 1.
- **Do not touch what part 3 owns.** `docs/superpowers/specs/2026-08-13-per-meal-polls-3-app-and-data.md` already covers: the four `.maybeSingle()` poll lookups, onboarding writing real `flat_meals` rows (including the wrong-`close_time` bug), recipe basis tagging, and the accompaniment CSV gap. None of those belong in this plan.
- **`app/` is not modified by this plan.** Part 3 owns the UI.
- All three functions have `verify_jwt = false`, so they can be curled with no auth header.

---

## File Structure

**Modified:**
- `supabase/functions/create_poll/index.ts` — skip flats that cannot produce a poll before they are counted as due (Task 1).
- `supabase/migrations/20260108000003_pg_cron.sql` — superseded by a new migration; not edited in place.

**Created:**
- `supabase/migrations/20260816000001_cron_retry.sql` — re-schedules the three cron jobs with a retry wrapper (Task 2).
- `app/e2e/unit/flat-eligibility.spec.ts` — tests for the new pure predicate (Task 1).
- `supabase/functions/_shared/flat-eligibility.ts` — the predicate itself (Task 1).

**Data-only (no files):**
- Task 3 deletes 4 abandoned flats via `db query`.

**Task order rationale:** Task 1 stops the bleeding I caused and is the only task with a test cycle. Task 2 fixes the pre-existing tick loss and is the riskiest (it rewrites live cron schedules), so it lands after the noise is gone and its effect is observable. Task 3 is destructive and needs explicit sign-off, so it is last among the fixes. Task 4 verifies the whole thing.

---

### Task 1: Stop retrying flats that can never produce a poll

**The evidence.** `create_poll` logged **52 `flat has no members` errors on 2026-08-16**, against 3–6/day on 08-13, 08-14 and 08-15. The jump is the due-latch introduced in part 2 Task 1: the old window-matching code failed a memberless flat **once**, in the single 15-minute tick containing its open time. `isMomentDue` keeps that flat due for a 24-hour grace window, so it is retried on **every tick** and fails identically each time.

This is log noise, not data damage — the function is correctly refusing to build a poll for a flat nobody belongs to. But it is a ~10× increase in error volume that will bury real failures, and it was introduced by part 2.

**Files:**
- Create: `supabase/functions/_shared/flat-eligibility.ts`
- Create: `app/e2e/unit/flat-eligibility.spec.ts`
- Modify: `supabase/functions/create_poll/index.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `shouldLogMissingMembers(flatId: string, pollDate: string, nowIst: Date, throttleMinutes?: number): boolean` — exported for testing; used only by `create_poll`.

- [ ] **Step 1: Write the failing test**

Create `app/e2e/unit/flat-eligibility.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { shouldLogMissingMembers } from '../../../supabase/functions/_shared/flat-eligibility.ts';

function ist(y: number, m: number, d: number, hh: number, mm: number): Date {
  return new Date(Date.UTC(y, m - 1, d, hh, mm));
}

// NOTE: buckets are measured from IST midnight, so with the 6h default the
// boundaries are 00:00, 06:00, 12:00 and 18:00 IST. These expectations were
// verified by executing the implementation before this plan was finalised —
// an earlier draft bucketed from the Unix epoch and got 09:00 wrong.
test('logs on the first tick of a bucket and not on the next two', () => {
  expect(shouldLogMissingMembers('flat-1', '2026-08-16', ist(2026, 8, 16, 6, 0))).toBe(true);
  expect(shouldLogMissingMembers('flat-1', '2026-08-16', ist(2026, 8, 16, 6, 15))).toBe(false);
  expect(shouldLogMissingMembers('flat-1', '2026-08-16', ist(2026, 8, 16, 6, 30))).toBe(false);
});

test('logs again once the throttle window elapses', () => {
  // Still visible in the logs, just 4 times a day instead of 96 — a
  // persistent misconfiguration must not vanish entirely.
  expect(shouldLogMissingMembers('flat-1', '2026-08-16', ist(2026, 8, 16, 6, 0))).toBe(true);
  expect(shouldLogMissingMembers('flat-1', '2026-08-16', ist(2026, 8, 16, 12, 0))).toBe(true);
});

test('midnight IST is a bucket boundary', () => {
  expect(shouldLogMissingMembers('flat-1', '2026-08-16', ist(2026, 8, 16, 0, 0))).toBe(true);
  expect(shouldLogMissingMembers('flat-1', '2026-08-16', ist(2026, 8, 16, 0, 45))).toBe(false);
});

test('a custom throttle window is respected', () => {
  expect(shouldLogMissingMembers('flat-1', '2026-08-16', ist(2026, 8, 16, 9, 0), 60)).toBe(true);
  expect(shouldLogMissingMembers('flat-1', '2026-08-16', ist(2026, 8, 16, 9, 59), 60)).toBe(false);
  expect(shouldLogMissingMembers('flat-1', '2026-08-16', ist(2026, 8, 16, 10, 0), 60)).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `/app`: `npm run test:unit`

Expected: FAIL — `shouldLogMissingMembers is not a function`. The 24 existing unit tests must still pass.

- [ ] **Step 3: Implement the predicate**

Create `supabase/functions/_shared/flat-eligibility.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `/app`: `npm run test:unit`

Expected: PASS, 28 tests (24 existing + 4 new).

- [ ] **Step 5: Wire it into `create_poll`**

In `supabase/functions/create_poll/index.ts`, add to the imports:

```ts
import { shouldLogMissingMembers } from '../_shared/flat-eligibility.ts';
```

The handler currently passes `nowIst` only to the due-check. `createPollForMeal` needs it too, so change the call site inside `Deno.serve`:

```ts
  const results = await Promise.all(
    due.map(({ meal, pollDate }) => createPollForMeal(admin, meal, pollDate, nowIst))
  );
```

and the signature:

```ts
async function createPollForMeal(
  admin: ReturnType<typeof createAdminClient>,
  meal: FlatMealRow,
  pollDate: string,
  nowIst: Date
): Promise<boolean> {
```

Then replace the memberless branch (currently `create_poll/index.ts:105-109`):

```ts
    const members = await fetchMemberDietProfiles(admin, flatId);
    if (members.length === 0) {
      await logPipelineError(admin, 'create_poll', { message: 'flat has no members' }, flatId);
      return false;
    }
```

with:

```ts
    const members = await fetchMemberDietProfiles(admin, flatId);
    if (members.length === 0) {
      // Throttled: the latch retries this flat every tick and it can never
      // succeed, so logging every time buries real failures. Still counted
      // as a failure so the response body stays honest.
      if (shouldLogMissingMembers(flatId, pollDate, nowIst)) {
        await logPipelineError(admin, 'create_poll', { message: 'flat has no members' }, flatId);
      }
      return false;
    }
```

- [ ] **Step 6: Deploy**

```bash
npx supabase functions deploy create_poll --project-ref pcmtsfcjzoivagpslpch
```

- [ ] **Step 7: Verify the flood stops**

Invoke twice in a row. Both calls must report the same `failures` count, but only the first may add a `pipeline_errors` row:

```bash
npx supabase db query --linked "select count(*) as before from pipeline_errors where detail->>'message' = 'flat has no members' and created_at > now() - interval '1 minute';"
curl -s -X POST https://pcmtsfcjzoivagpslpch.supabase.co/functions/v1/create_poll
curl -s -X POST https://pcmtsfcjzoivagpslpch.supabase.co/functions/v1/create_poll
npx supabase db query --linked "select count(*) as after from pipeline_errors where detail->>'message' = 'flat has no members' and created_at > now() - interval '1 minute';"
```

Expected: `after - before` is at most the number of memberless flats (one row each), **not** twice that. The `failures` count in both responses stays non-zero — throttling the log must not hide the failure from the response body.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/flat-eligibility.ts app/e2e/unit/flat-eligibility.spec.ts supabase/functions/create_poll/index.ts
git commit -m "Throttle the unfixable-flat error the latch amplified"
```

---

### Task 2: Retry the cron invocation so a 500 does not lose a tick

**The evidence.** Over a 6-hour window, `net._http_response` shows **72 responses, 64 OK, 7 non-200**. Every non-200 is:

```
status_code 500, body {"error":"JWT issued at future"}
```

This is **not** our function failing — it is the request failing before the function body runs, so roughly **1 in 10 cron ticks is lost entirely**. It hits all three functions, always at `:00`–`:02` past a tick, at random. `_shared/supabase-admin.ts` uses a static service-role key and mints no JWT, so the skew is between Supabase's own gateway and auth server; we cannot fix the cause, only stop losing the tick.

The due-latch already masks most of the damage (the next tick recovers the work). This task closes the remaining window: a stage whose *only* qualifying tick 500s still gets a second chance immediately rather than waiting 15 minutes.

**Files:**
- Create: `supabase/migrations/20260816000001_cron_retry.sql`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Record the current failure rate**

This is the before-measurement the final verification compares against. Save the number:

```bash
npx supabase db query --linked "select count(*) as total, count(*) filter (where status_code <> 200) as failed, round(100.0 * count(*) filter (where status_code <> 200) / greatest(count(*),1), 1) as pct_failed from net._http_response where created > now() - interval '6 hours';"
```

Expected today: roughly 10% failed. Write the number down.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260816000001_cron_retry.sql`:

```sql
-- Roughly 1 in 10 pg_net invocations of the pipeline functions returns
-- HTTP 500 {"error":"JWT issued at future"} before the function body runs.
-- The skew is between Supabase's gateway and auth server — our functions use
-- a static service-role key and mint no JWT (supabase/functions/_shared/
-- supabase-admin.ts), so we cannot fix the cause. Measured 2026-08-16:
-- 72 pg_net responses in 6 hours, 7 of them 500s.
--
-- Part 2's due-latch already recovers most of this: a stage stays due until
-- its grace window expires, so the next 15-minute tick redoes the work. This
-- closes the remaining gap by firing each function twice per tick, 30 seconds
-- apart. Two independent draws at a ~10% failure rate leave ~1% of ticks
-- fully lost instead of ~10%.
--
-- Safe to double-fire because every stage is idempotent: create_poll probes
-- unique (flat_id, poll_date, flat_meal_id), close_poll scopes its update to
-- status = 'open', dispatch_cook only acts on a 'closed' poll and flips it to
-- 'dispatched'. The second call is a no-op whenever the first succeeded.
--
-- cron.schedule() on an existing jobname replaces that job's definition, so
-- this migration supersedes 20260108000003_pg_cron.sql rather than
-- duplicating it. Job names are unchanged.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_pipeline_function(fn text)
returns void
language plpgsql
security definer
set search_path = extensions, public
as $$
declare
  fn_url text := 'https://pcmtsfcjzoivagpslpch.supabase.co/functions/v1/' || fn;
begin
  perform net.http_post(
    url := fn_url,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  -- Second attempt in the same tick. pg_net is async — http_post queues the
  -- request and returns immediately — so this sleep delays only this one
  -- background worker, never a user-facing statement.
  perform pg_sleep(30);
  perform net.http_post(
    url := fn_url,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end;
$$;

select cron.schedule(
  'create_poll_every_15_min',
  '*/15 * * * *',
  $$ select public.invoke_pipeline_function('create_poll'); $$
);

select cron.schedule(
  'close_poll_every_15_min',
  '*/15 * * * *',
  $$ select public.invoke_pipeline_function('close_poll'); $$
);

select cron.schedule(
  'dispatch_cook_every_15_min',
  '*/15 * * * *',
  $$ select public.invoke_pipeline_function('dispatch_cook'); $$
);
```

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify the jobs were replaced, not duplicated**

```bash
npx supabase db query --linked "select jobid, jobname, schedule, active, command from cron.job order by jobname;"
```

Expected: exactly **3** rows, the same three `jobname`s as before, each `command` now calling `public.invoke_pipeline_function`. If there are 6 rows, the old jobs were not replaced — unschedule the duplicates by jobid before continuing.

- [ ] **Step 5: Watch two real ticks**

Wait for two 15-minute boundaries to pass, then:

```bash
npx supabase db query --linked "select j.jobname, r.status, r.start_time at time zone 'Asia/Kolkata' as start_ist from cron.job_run_details r join cron.job j on j.jobid = r.jobid where r.start_time > now() - interval '35 minutes' order by r.start_time desc;"
```

Expected: every row `status = succeeded`. A `failed` row means the wrapper function itself is broken (not the HTTP call, which is async and cannot fail the job) — read `return_message` on that row.

Then confirm both attempts are firing:

```bash
npx supabase db query --linked "select count(*) as responses_30min from net._http_response where created > now() - interval '30 minutes';"
```

Expected: roughly double the previous rate — about 12 responses per 30 minutes (3 functions × 2 attempts × 2 ticks) instead of 6.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260816000001_cron_retry.sql
git commit -m "Retry each cron invocation to survive gateway 500s"
```

---

### Task 3: Delete the abandoned flats

**The evidence.** Five flats have an active meal but zero members, so `create_poll` can never build a poll for them:

| name | id | created (IST) | polls | cooks |
|---|---|---|---|---|
| `GWR-C2-004` | `3a725333-965d-4f48-a79b-925339503a90` | 2026-08-09 10:19 | **4** | 1 |
| `gwr-c2004` | `0cf1cb92-9e9b-42ad-ab65-fff835fbfb63` | 2026-08-13 05:27 | 0 | 0 |
| `c2-004` | `c0374424-78e6-4f6a-8897-043f88afe605` | 2026-08-13 05:58 | 0 | 1 |
| `123` | `f5119e8a-16bb-42d1-875c-adc9ad8dfa21` | 2026-08-13 06:22 | 0 | 0 |
| `C2-004` | `58445fa2-a5ed-4d50-beed-b3434f7a055f` | 2026-08-15 02:25 | 0 | 1 |

**`GWR-C2-004` is different from the other four** — it has 4 historical polls, so it was a real flat that lost its members, not an abandoned onboarding attempt. Deleting it destroys dispatch history. This task deletes **only the four with zero polls** and leaves `GWR-C2-004` in place; Task 1's throttle keeps it quiet.

**This task is destructive and irreversible. Do not run it without explicit sign-off from the repo owner**, even though the rows look disposable.

**Files:** none — data-only, executed via `db query`.

**Interfaces:**
- Consumes: Task 1 must already be deployed, so the log stays quiet for `GWR-C2-004` which survives this cleanup.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Get explicit confirmation**

Show the repo owner the table above and confirm the four zero-poll flats may be deleted. Stop here until they agree. If they decline, skip to Task 4 — Task 1 alone reduces the noise to an acceptable level.

- [ ] **Step 2: Re-verify the targets immediately before deleting**

The set is computed fresh rather than trusting the ids above, in case someone joined one of these flats in the meantime. It also counts `feedback` rows, which is the one thing that can block the delete — see Step 3:

```bash
npx supabase db query --linked "select f.id, f.name, (select count(*) from flat_members m where m.flat_id = f.id) as members, (select count(*) from daily_polls p where p.flat_id = f.id) as polls, (select count(*) from feedback fb where fb.flat_id = f.id) as feedback_rows from flats f where (select count(*) from flat_members m where m.flat_id = f.id) = 0 and (select count(*) from daily_polls p where p.flat_id = f.id) = 0 order by f.created_at;"
```

Expected: exactly 4 rows, all with `members = 0` and `polls = 0`. **If any row shows a non-zero `members` or `polls` count, stop** — the situation has changed since this plan was written.

If any row has `feedback_rows > 0`, do not improvise a fix: that flat has real user feedback attached, so decide with the repo owner whether to reassign or delete it before continuing.

- [ ] **Step 3: Delete, scoped to the verified predicate**

Most flat-scoped tables cascade, but **`feedback.flat_id` is `ON DELETE NO ACTION`** (verified against the live project 2026-08-16) — so this delete raises a foreign-key violation for any flat with feedback rather than silently removing it. Today all four targets have zero feedback rows, so it succeeds; the guard in Step 2 is what makes that safe rather than lucky.

`pipeline_errors.flat_id` has no foreign key at all, so its rows neither block the delete nor get cleaned up. That is intended: keeping the error history after the flat is gone costs nothing and preserves the record of why the flat was deleted.

The delete deliberately re-derives the target set in the `where` clause instead of hardcoding ids, so a flat that gained a member or a poll between Step 2 and Step 3 is not deleted:

```bash
npx supabase db query --linked "delete from flats f where (select count(*) from flat_members m where m.flat_id = f.id) = 0 and (select count(*) from daily_polls p where p.flat_id = f.id) = 0 returning id, name;"
```

Expected: 4 rows returned. `flat_meals`, `cooks`, `day_attendance` and `activity_log` are removed by their `on delete cascade` foreign keys.

If this fails with a foreign-key violation on `feedback`, the situation changed between Step 2 and here — re-run Step 2 and resolve the feedback rows with the repo owner before retrying.

- [ ] **Step 4: Confirm the survivor and the baseline**

```bash
npx supabase db query --linked "select (select count(*) from flats) as flats, (select count(*) from flats f where (select count(*) from flat_members m where m.flat_id = f.id) = 0) as memberless, (select count(*) from flats f join flat_meals m on m.flat_id = f.id) as total_meals, (select count(*) from flats f join flat_meals m on m.flat_id = f.id where f.poll_open_time = (m.serve_time - make_interval(mins => m.open_offset_min))::time and f.poll_close_time = m.close_time and f.dispatch_time = (m.serve_time - make_interval(mins => m.dispatch_offset_min))::time) as schedule_matches;"
```

Expected: `flats = 5`, `memberless = 1` (that is `GWR-C2-004`, kept deliberately), and `total_meals = schedule_matches` — the baseline must still be fully matched, just over fewer rows.

- [ ] **Step 5: Commit**

No files changed. Record the cleanup in the repo so the flat-count change is not mysterious later:

```bash
git commit --allow-empty -m "Delete four abandoned memberless flats (data-only)"
```

---

### Task 4: Verify and document

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Tasks 1–3 deployed.
- Produces: nothing.

- [ ] **Step 1: Re-assert the schedule baseline**

```bash
npx supabase db query --linked "select f.name, (f.poll_open_time = (m.serve_time - make_interval(mins => m.open_offset_min))::time and f.poll_close_time = m.close_time and f.dispatch_time = (m.serve_time - make_interval(mins => m.dispatch_offset_min))::time) as schedule_matches from flats f join flat_meals m on m.flat_id = f.id order by f.name;"
```

Expected: `schedule_matches = true` for every row. A `false` means a scheduling regression.

- [ ] **Step 2: Run the unit suite and typecheck**

From `/app`:

```bash
npm run test:unit
npx tsc --noEmit
```

Expected: 28 unit tests pass; typecheck exits 0.

**Do not run `npm run test:e2e` as a gate.** Measured 2026-08-15 it is 10 passed / 18 failed, and the failures predate this work — `settings.spec.ts:58` and `poll-lifecycle.spec.ts:12` were confirmed to reproduce identically on `299cd2e`. If you want to check e2e anyway, compare against that baseline, and bisect any new failure against `299cd2e` before attributing it to this plan.

- [ ] **Step 3: Confirm the error rate actually dropped**

Wait until at least 2 hours after Task 2's deploy, then compare the day's totals:

```bash
npx supabase db query --linked "select date_trunc('day', created_at at time zone 'Asia/Kolkata')::date as day, detail->>'message' as message, count(*) as n from pipeline_errors where created_at > now() - interval '3 days' group by 1,2 order by 1 desc, 3 desc;"
```

Expected, comparing today against 2026-08-16's numbers:
- `flat has no members` — down from 52/day to at most a handful (Task 1's throttle; only `GWR-C2-004` remains after Task 3).
- `JWT issued at future` — down from ~19/day. It will **not** reach zero: Task 2 retries the call, it does not fix the gateway skew, and a logged row means the retry also failed.
- `empty cart at dispatch time` and `no active cook for flat` — unchanged, and correctly so. Both are real conditions this plan does not address.

- [ ] **Step 4: Update `CLAUDE.md`**

The Repo status section describes the pipeline but not its operational quirks. Add after the paragraph describing the latch:

```markdown
Known operational quirks: roughly 1 in 10 pg_net cron invocations returns HTTP 500 `{"error":"JWT issued at future"}` before the function body runs — clock skew inside Supabase, not our code, which uses a static service-role key and mints no JWT. Each cron job therefore fires its function twice, 30 seconds apart (`supabase/migrations/20260816000001_cron_retry.sql`); all three stages are idempotent, so the second call is a no-op when the first succeeded. `pipeline_errors` rows named `flat has no members` are throttled to roughly one per flat per 6 hours (`supabase/functions/_shared/flat-eligibility.ts`), because the due-latch retries such flats every tick and they can never succeed.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Document the pipeline's operational quirks"
```

---

## Explicitly not in this plan

- **The 18 failing e2e tests.** Verified pre-existing (reproduced on `299cd2e` with none of part 2's code present). They are app/fixture failures, not pipeline failures, and root-causing them is its own investigation — it needs a debugging pass, not an implementation plan.
- **Everything in part 3's spec:** the four `.maybeSingle()` poll lookups, onboarding writing real `flat_meals` rows (which is also what creates the wrong `close_time`), recipe basis tagging, and the accompaniment CSV gap. See `docs/superpowers/specs/2026-08-13-per-meal-polls-3-app-and-data.md`.
- **`empty cart at dispatch time` and `no active cook for flat`.** Both are true statements about real flats. The first is a product question (should an empty cart dispatch nothing, or a "nothing tonight" message?); the second is a setup gap. Neither is a bug in the pipeline.
- **Dropping `flats.poll_open_time` / `poll_close_time` / `dispatch_time`.** The app still reads them; part 3 removes the last readers and then drops the columns.
