# Per-meal polls, part 2 — the daily pipeline: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the three Edge Functions over from *"one poll per flat per day, scheduled by three columns on `flats`"* to *"one poll per `flat_meals` row per day, scheduled by that row"*.

**Architecture:** The functions keep their current shape — pg_cron fires each one every 15 minutes and the function self-selects what is due by comparing IST wall-clock. Only the *iteration unit* changes, from `flats` to `flat_meals`. Everything hinges on one new pure helper (`eventMomentIst`) that anchors on the **serving date** and computes the open/dispatch moment backwards, which is what lets a meal's poll open on the previous calendar day without any special-casing.

**Tech Stack:** Deno Edge Functions (TypeScript), Supabase JS v2, Postgres, pg_cron + pg_net. Tests run under the repo's existing Playwright install as pure Node unit tests — no new dependency.

**Spec:** `docs/superpowers/specs/2026-08-13-per-meal-polls-2-pipeline.md`

## Global Constraints

- **Live project.** Ref `pcmtsfcjzoivagpslpch`. There is no local/mock Supabase in this workflow. Every deploy is to production; the 7 real flats below run on it.
- **pg_cron is unchanged.** `supabase/migrations/20260108000003_pg_cron.sql` fires all three functions every 15 minutes unconditionally. After this part the functions latch on "is this due yet and not yet done" rather than "does this tick contain the target time" (Task 1), so the cron interval no longer has to be kept in lockstep with a window constant — a shorter or longer interval changes only how promptly work is picked up. `isWithinCronWindow`'s 15-minute default still backs the regression test pinning old and new behaviour together, so leave it at 15.
- **All 7 live flats have exactly one `Dinner` meal** (`basis='full'`, `serve_time=20:30`, `open_offset_min=690`, `dispatch_offset_min=270`, `close_time` per-flat). Verified: for all 7, `poll_open_time = serve_time - open_offset_min`, `poll_close_time = close_time`, and `dispatch_time = serve_time - dispatch_offset_min`. **This is the regression baseline** — after this change every one of those flats must still open, close and dispatch at exactly the same wall-clock times.
- **No app changes in this part.** `app/` is untouched. Part 3 owns the UI.
- **`flats.poll_open_time` / `poll_close_time` / `dispatch_time` are not dropped here.** They stay as the app still reads them until part 3. This part simply stops the *functions* reading them.
- **Deno is not installed in this environment.** Do not plan on `deno test` or `deno check`. Tests run via `npx playwright test --config=e2e/unit/playwright.config.ts` from `/app`; type-checking of function code happens at deploy time (`supabase functions deploy` bundles and will surface type errors).
- **`basis` is a closed set:** `'breakfast' | 'light' | 'full'` (`docs/05-schema.sql`, checked constraint).
- Deploy command, per function: `npx supabase functions deploy <name> --project-ref pcmtsfcjzoivagpslpch`.
- All three functions have `verify_jwt = false`, so they can be curled with no auth header.

---

## File Structure

**Created:**
- `app/e2e/unit/playwright.config.ts` — a second Playwright project for pure unit tests. Separate from `e2e/playwright.config.ts` because that one boots an Expo web server for every run; these tests need no browser and must stay fast.
- `app/e2e/unit/ist-time.spec.ts` — tests for the scheduling primitive.
- `app/e2e/unit/select-options.spec.ts` — tests for seed separation and basis filtering.
- `supabase/functions/_shared/flat-meals.ts` — the shared "which meals are due this tick" query + row type, used by all three functions.

**Modified:**
- `supabase/functions/_shared/ist-time.ts` — add `eventMomentIst`, `istDateStringOffset`, `isMomentInCronWindow`, `isMomentDue`.
- `supabase/functions/_shared/pipeline-errors.ts` — add `serializeError`.
- `supabase/functions/create_poll/index.ts` — iterate meals; basis-scoped pool and exclusion; candidate serving dates.
- `supabase/functions/create_poll/select-options.ts` — meal id in the RNG seed; basis-aware pool filter.
- `supabase/functions/close_poll/index.ts` — per-meal poll resolution; per-meal attendance.
- `supabase/functions/dispatch_cook/index.ts` — per-meal poll resolution; meal name in the message.
- `supabase/functions/dispatch_cook/compose-payload.ts` — meal name/timing in the English payload.

**Task order rationale:** Tasks 1–2 build and test the pure primitives with no deployment risk. Task 3 is the shared query. Tasks 4–6 rewrite one function each, deploying and verifying between them. Task 7 closes the observability gap. Each of tasks 4–6 leaves the pipeline in a working state.

---

### Task 1: The scheduling primitive

The whole feature rests on this arithmetic. A meal served 20:30 tomorrow with `open_offset_min = 690` opens at 09:00 **today** — the offset may exceed 1440 and cross midnight, which is precisely the case that must not be special-cased.

This task also replaces window matching with a **due latch** across all three functions. Each currently fires only during the single 15-minute tick containing its target time, so any missed tick silently loses that stage for the whole day. Two ways that happens in practice: a cron run that fails or is delayed, and a flat editing its poll time to a moment the current tick has already passed (set 09:00 to 09:10 at 09:20 and no later tick can ever match).

The latch is only safe because each stage already has an idempotent "already done" check — `create_poll`'s unique `(flat_id, poll_date, flat_meal_id)` probe, `close_poll`'s `status = 'open'` filter, `dispatch_cook`'s `'closed' → 'dispatched'` transition. Each also gets an upper bound so catch-up can't fire something uselessly late: `create_poll` skips a poll already past its close time, `dispatch_cook` uses a 45-minute grace and never dispatches past the serve time.

**Files:**
- Modify: `supabase/functions/_shared/ist-time.ts`
- Create: `app/e2e/unit/playwright.config.ts`
- Test: `app/e2e/unit/ist-time.spec.ts`

**Interfaces:**
- Consumes: existing `nowInIst()`, `istDateString()`, `isWithinCronWindow()` from the same file.
- Produces:
  - `eventMomentIst(serveDate: string, serveTime: string, offsetMin: number): Date` — the IST moment `offsetMin` minutes before `serveTime` on `serveDate`. Returned as a `Date` whose **UTC fields carry IST wall-clock**, matching the existing convention set by `nowInIst()`.
  - `istDateStringOffset(nowIst: Date, dayOffset: number): string` — `YYYY-MM-DD` for today (`0`) or tomorrow (`1`).
  - `isMomentInCronWindow(moment: Date, nowIst: Date, windowMinutes?: number): boolean` — true when `moment` falls in `[nowIst, nowIst + windowMinutes)`. Compares absolute moments, unlike `isWithinCronWindow` which compares time-of-day only. Kept for the tests that pin the two helpers' agreement; the functions themselves use `isMomentDue`.
  - `isMomentDue(moment: Date, nowIst: Date, graceMinutes?: number): boolean` — true from `moment` until `graceMinutes` after it (default 24h). The latch: survives a missed tick, and is safe to re-run because callers pair it with their own already-done check.

- [ ] **Step 1: Create the unit-test Playwright project**

The existing `e2e/playwright.config.ts` has a `webServer` block that starts Expo on port 8081. These are pure-function tests; booting a web server for them would make the cycle slow and flaky.

Create `app/e2e/unit/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

// Pure unit tests over the Edge Functions' shared logic. Deliberately a
// separate project from e2e/playwright.config.ts: that one boots an Expo web
// server and drives a browser against the live Supabase project, which these
// tests need none of. Playwright is already a devDependency, so this adds a
// test runner for supabase/functions/** without a new dependency (Deno is not
// installed in this environment).
export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  workers: undefined,
  reporter: [['list']],
});
```

Add the script to `app/package.json` alongside the existing `test:e2e` entries:

```json
"test:unit": "playwright test --config=e2e/unit/playwright.config.ts",
```

- [ ] **Step 2: Write the failing tests**

Create `app/e2e/unit/ist-time.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import {
  eventMomentIst,
  istDateStringOffset,
  isMomentDue,
  isMomentInCronWindow,
  isWithinCronWindow,
} from '../../../supabase/functions/_shared/ist-time.ts';

// Convention throughout: an "IST Date" carries IST wall-clock in its UTC
// fields (see nowInIst). Date.UTC(...) is therefore the right constructor.
function ist(y: number, m: number, d: number, hh: number, mm: number): Date {
  return new Date(Date.UTC(y, m - 1, d, hh, mm));
}

test('eventMomentIst subtracts the offset from the serve time', () => {
  // Dinner: served 20:30, opens 690 min earlier = 09:00 the same day.
  const moment = eventMomentIst('2026-08-13', '20:30:00', 690);
  expect(moment.getTime()).toBe(ist(2026, 8, 13, 9, 0).getTime());
});

test('eventMomentIst crosses midnight backwards into the previous day', () => {
  // Breakfast served 08:00, opening 840 min (14h) earlier lands at 18:00 on
  // the PREVIOUS calendar day. This is the entire reason the helper exists:
  // poll_date anchors on the serving date, not on the day the poll opens.
  const moment = eventMomentIst('2026-08-14', '08:00:00', 840);
  expect(moment.getTime()).toBe(ist(2026, 8, 13, 18, 0).getTime());
});

test('eventMomentIst handles an offset beyond 24 hours', () => {
  // 1500 min = 25h before 08:00 on the 14th → 07:00 on the 13th.
  const moment = eventMomentIst('2026-08-14', '08:00:00', 1500);
  expect(moment.getTime()).toBe(ist(2026, 8, 13, 7, 0).getTime());
});

test('eventMomentIst treats a zero offset as the serve time itself', () => {
  const moment = eventMomentIst('2026-08-13', '20:30:00', 0);
  expect(moment.getTime()).toBe(ist(2026, 8, 13, 20, 30).getTime());
});

test('eventMomentIst accepts a time with no seconds component', () => {
  // flat_meals.serve_time comes back from PostgREST as "20:30:00", but
  // fixtures and hand-written SQL often use "20:30".
  expect(eventMomentIst('2026-08-13', '20:30', 690).getTime()).toBe(
    eventMomentIst('2026-08-13', '20:30:00', 690).getTime()
  );
});

test('istDateStringOffset returns today and tomorrow', () => {
  const now = ist(2026, 8, 13, 9, 5);
  expect(istDateStringOffset(now, 0)).toBe('2026-08-13');
  expect(istDateStringOffset(now, 1)).toBe('2026-08-14');
});

test('istDateStringOffset rolls over a month boundary', () => {
  expect(istDateStringOffset(ist(2026, 8, 31, 23, 50), 1)).toBe('2026-09-01');
});

test('isMomentInCronWindow is true at the window start and false at its end', () => {
  const now = ist(2026, 8, 13, 9, 0);
  // Inclusive lower bound, exclusive upper bound — matches isWithinCronWindow,
  // so a moment landing exactly on a tick fires exactly once.
  expect(isMomentInCronWindow(ist(2026, 8, 13, 9, 0), now)).toBe(true);
  expect(isMomentInCronWindow(ist(2026, 8, 13, 9, 14), now)).toBe(true);
  expect(isMomentInCronWindow(ist(2026, 8, 13, 9, 15), now)).toBe(false);
});

test('isMomentInCronWindow is false for a moment already past', () => {
  const now = ist(2026, 8, 13, 9, 0);
  expect(isMomentInCronWindow(ist(2026, 8, 13, 8, 59), now)).toBe(false);
});

test('isMomentInCronWindow matches isWithinCronWindow at the tick that fires it', () => {
  // The single-meal regression guarantee: on the tick where the old
  // time-of-day check first fires, the new absolute-moment check fires too.
  // NOTE: the two helpers agree only ON the firing tick, not throughout the
  // window — an earlier draft of this test compared them at 09:05 for a 09:00
  // event and failed, because isWithinCronWindow asks "has the target passed
  // within this window" while isMomentInCronWindow asks "is this upcoming".
  const tick = ist(2026, 8, 13, 9, 0);
  const moment = eventMomentIst('2026-08-13', '20:30:00', 690); // 09:00
  expect(isMomentInCronWindow(moment, tick)).toBe(isWithinCronWindow('09:00:00', tick));
  expect(isMomentInCronWindow(moment, tick)).toBe(true);
});

test('isWithinCronWindow and isMomentInCronWindow diverge mid-window, and isMomentDue is the latch', () => {
  const now = ist(2026, 8, 13, 9, 5);
  const moment = eventMomentIst('2026-08-13', '20:30:00', 690); // 09:00
  expect(isWithinCronWindow('09:00:00', now)).toBe(true);
  expect(isMomentInCronWindow(moment, now)).toBe(false);
  expect(isMomentDue(moment, now)).toBe(true);
});

test('isMomentDue stays true after the tick that window matching would miss', () => {
  // The whole point of the latch. A poll time edited from 09:00 to 09:10 at
  // 09:20 leaves an open moment that no future 15-minute tick can match,
  // so window matching drops the poll for the entire day.
  const moment = ist(2026, 8, 13, 9, 10);
  const nextTick = ist(2026, 8, 13, 9, 30);
  expect(isMomentInCronWindow(moment, nextTick)).toBe(false);
  expect(isMomentDue(moment, nextTick)).toBe(true);
});

test('isMomentDue is false before the moment arrives', () => {
  const moment = ist(2026, 8, 13, 9, 0);
  expect(isMomentDue(moment, ist(2026, 8, 13, 8, 59))).toBe(false);
  expect(isMomentDue(moment, ist(2026, 8, 13, 9, 0))).toBe(true);
});

test('isMomentDue abandons an event older than the grace period', () => {
  // Bounds catch-up: a function coming back after a long outage must not
  // fire events from previous days.
  const moment = ist(2026, 8, 13, 9, 0);
  expect(isMomentDue(moment, ist(2026, 8, 13, 23, 59))).toBe(true);
  expect(isMomentDue(moment, ist(2026, 8, 14, 9, 1))).toBe(false);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run from `/app`: `npm run test:unit`

Expected: FAIL — `eventMomentIst is not a function` (and the same for the other three new exports). The two assertions using only `isWithinCronWindow` should already pass.

- [ ] **Step 4: Implement the helpers**

Append to `supabase/functions/_shared/ist-time.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run from `/app`: `npm run test:unit`

Expected: PASS, 14 tests.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/ist-time.ts app/e2e/unit/playwright.config.ts app/e2e/unit/ist-time.spec.ts app/package.json
git commit -m "Anchor meal scheduling on the serving date"
```

---

### Task 2: Seed separation and basis filtering in option selection

Two meals on one day would otherwise get byte-identical suggestion lists, because the RNG is seeded on `(flatId, pollDate)` alone.

**Files:**
- Modify: `supabase/functions/create_poll/select-options.ts`
- Test: `app/e2e/unit/select-options.spec.ts`

**Interfaces:**
- Consumes: `seededRng`, `isRecipeEligible` (already exported).
- Produces:
  - `selectPollOptions` gains a required `flatMealId: string` param and its `RecipeCandidate` gains `suitable_bases: string[]`.
  - `selectAccompanimentOptions` and `selectAccompanimentOptionsForSuggestedMains` each gain a required `flatMealId: string` param.
  - `filterByBasis(recipes: RecipeCandidate[], basis: string): RecipeCandidate[]` — exported for testing.

- [ ] **Step 1: Write the failing tests**

Create `app/e2e/unit/select-options.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import {
  filterByBasis,
  selectPollOptions,
  type RecipeCandidate,
} from '../../../supabase/functions/create_poll/select-options.ts';

const MEMBERS = [{ diet_type: 'nonveg', is_jain: false, allergies: [] as string[] }];

function recipe(id: string, over: Partial<RecipeCandidate> = {}): RecipeCandidate {
  return {
    id,
    cuisine: over.cuisine ?? `cuisine-${id}`,
    base: over.base ?? `base-${id}`,
    diet_class: over.diet_class ?? 'veg',
    jain_ok: over.jain_ok ?? true,
    allergens: over.allergens ?? [],
    suitable_bases: over.suitable_bases ?? ['full'],
  };
}

// A pool big enough that the seeded shuffle has real freedom — with <= 3
// candidates every seed returns the same set and the seed test is vacuous.
const POOL = Array.from({ length: 20 }, (_, i) =>
  recipe(`r${i}`, { suitable_bases: ['breakfast', 'light', 'full'] })
);

test('two meals on the same day get different suggestions', () => {
  const common = {
    flatId: 'flat-1',
    pollDate: '2026-08-13',
    members: MEMBERS,
    eligibleRecipes: POOL,
    recentlyServedRecipeIds: new Set<string>(),
    basis: 'full',
  };
  const breakfast = selectPollOptions({ ...common, flatMealId: 'meal-breakfast' });
  const dinner = selectPollOptions({ ...common, flatMealId: 'meal-dinner' });

  expect(breakfast).toHaveLength(3);
  expect(dinner).toHaveLength(3);
  // This is the actual bug being fixed: without flatMealId in the seed these
  // two arrays are byte-identical.
  expect(breakfast).not.toEqual(dinner);
});

test('the same meal on the same day is still deterministic', () => {
  const args = {
    flatId: 'flat-1',
    pollDate: '2026-08-13',
    flatMealId: 'meal-dinner',
    members: MEMBERS,
    eligibleRecipes: POOL,
    recentlyServedRecipeIds: new Set<string>(),
    basis: 'full',
  };
  // Idempotency is a stated repo invariant (CLAUDE.md): re-running create_poll
  // for a flat/day/meal must not change results.
  expect(selectPollOptions(args)).toEqual(selectPollOptions(args));
});

test('filterByBasis keeps only recipes tagged for that basis', () => {
  const pool = [
    recipe('poha', { suitable_bases: ['breakfast'] }),
    recipe('dal', { suitable_bases: ['full'] }),
    recipe('khichdi', { suitable_bases: ['light', 'full'] }),
  ];
  expect(filterByBasis(pool, 'breakfast').map((r) => r.id)).toEqual(['poha']);
  expect(filterByBasis(pool, 'light').map((r) => r.id)).toEqual(['khichdi']);
  expect(filterByBasis(pool, 'full').map((r) => r.id).sort()).toEqual(['dal', 'khichdi']);
});

test('selectPollOptions excludes recipes not suitable for the basis', () => {
  const pool = [
    ...Array.from({ length: 5 }, (_, i) => recipe(`b${i}`, { suitable_bases: ['breakfast'] })),
    ...Array.from({ length: 5 }, (_, i) => recipe(`f${i}`, { suitable_bases: ['full'] })),
  ];
  const picked = selectPollOptions({
    flatId: 'flat-1',
    pollDate: '2026-08-13',
    flatMealId: 'meal-breakfast',
    members: MEMBERS,
    eligibleRecipes: pool,
    recentlyServedRecipeIds: new Set<string>(),
    basis: 'breakfast',
  });
  expect(picked).toHaveLength(3);
  expect(picked.every((id) => id.startsWith('b'))).toBe(true);
});

test('an empty basis pool returns no options rather than falling back', () => {
  // Suggesting dinner food for breakfast would be worse than suggesting
  // nothing — the dietary veto and the basis filter are both hard filters.
  const picked = selectPollOptions({
    flatId: 'flat-1',
    pollDate: '2026-08-13',
    flatMealId: 'meal-breakfast',
    members: MEMBERS,
    eligibleRecipes: [recipe('dal', { suitable_bases: ['full'] })],
    recentlyServedRecipeIds: new Set<string>(),
    basis: 'breakfast',
  });
  expect(picked).toEqual([]);
});

test('the 10-day exclusion still relaxes before returning an empty poll', () => {
  // Pre-existing behavior that must survive: a repeat beats no poll at all.
  const pool = Array.from({ length: 4 }, (_, i) => recipe(`r${i}`));
  const picked = selectPollOptions({
    flatId: 'flat-1',
    pollDate: '2026-08-13',
    flatMealId: 'meal-dinner',
    members: MEMBERS,
    eligibleRecipes: pool,
    recentlyServedRecipeIds: new Set(pool.map((r) => r.id)),
    basis: 'full',
  });
  expect(picked).toHaveLength(3);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `/app`: `npm run test:unit`

Expected: FAIL — `filterByBasis is not a function`, and the two-meals test fails with the arrays being equal.

- [ ] **Step 3: Add the basis filter and thread the meal id through the seed**

In `supabase/functions/create_poll/select-options.ts`:

Add `suitable_bases` to the candidate interface:

```ts
export interface RecipeCandidate {
  id: string;
  cuisine: string;
  base: string;
  diet_class: string;
  jain_ok: boolean;
  allergens: string[];
  suitable_bases: string[];
}
```

Add the filter, next to `isRecipeEligible`:

```ts
// A meal's `basis` (breakfast | light | full) is a hard filter, not a
// preference: suggesting biryani for breakfast is worse than suggesting
// nothing. Recipes carry recipes.suitable_bases (part 1's migration), so a
// dish can be tagged for several bases — khichdi is both 'light' and 'full'.
export function filterByBasis(recipes: RecipeCandidate[], basis: string): RecipeCandidate[] {
  return recipes.filter((r) => r.suitable_bases.includes(basis));
}
```

Update `selectPollOptions` — signature, seed, and filter order:

```ts
export function selectPollOptions(params: {
  flatId: string;
  pollDate: string;
  flatMealId: string;
  members: MemberDiet[];
  eligibleRecipes: RecipeCandidate[];
  recentlyServedRecipeIds: Set<string>;
  basis: string;
}): string[] {
  const { flatId, pollDate, flatMealId, members, eligibleRecipes, recentlyServedRecipeIds, basis } =
    params;
  // flatMealId in the seed: without it, breakfast and dinner on the same day
  // draw byte-identical suggestion lists.
  const rng = seededRng(`${flatId}:${pollDate}:${flatMealId}`);

  const basisFiltered = filterByBasis(eligibleRecipes, basis);
  const dietFiltered = basisFiltered.filter((r) => isRecipeEligible(r, members));
  const notRecentlyServed = dietFiltered.filter((r) => !recentlyServedRecipeIds.has(r.id));

  const pool = notRecentlyServed.length >= 3 ? notRecentlyServed : dietFiltered;
  if (pool.length === 0) return [];
  if (pool.length <= 3) return shuffle(pool, rng).map((r) => r.id);

  const shuffled = shuffle(pool, rng);

  for (let start = 0; start + 3 <= shuffled.length; start++) {
    const candidate = shuffled.slice(start, start + 3);
    if (hasVariety(candidate)) return candidate.map((r) => r.id);
  }

  return shuffled.slice(0, 3).map((r) => r.id);
}
```

Update the header comment's point 4 to name the new seed:

```ts
//   4. Deterministic: shuffled with a (flat_id, poll_date, flat_meal_id)-seeded
//      RNG so re-running create_poll for the same flat/day/meal is idempotent
//      even before the daily_polls unique-constraint check runs, while two
//      meals on one day still get different suggestions.
```

Thread `flatMealId` through both accompaniment functions. In `selectAccompanimentOptions`:

```ts
export function selectAccompanimentOptions(params: {
  flatId: string;
  pollDate: string;
  flatMealId: string;
  validAccompaniments: { recipeId: string; sortOrder: number }[];
}): string[] {
  const { flatId, pollDate, flatMealId, validAccompaniments } = params;
  if (validAccompaniments.length === 0) return [];

  const rng = seededRng(`${flatId}:${pollDate}:${flatMealId}:accompaniment`);
  const sorted = [...validAccompaniments].sort((a, b) => a.sortOrder - b.sortOrder);
  const shuffled = shuffle(sorted, rng);
  return shuffled.slice(0, 3).map((a) => a.recipeId);
}
```

And in `selectAccompanimentOptionsForSuggestedMains`, add `flatMealId: string;` to the params type, destructure it, and pass it through to `selectAccompanimentOptions({ flatId, pollDate, flatMealId, validAccompaniments })`. Note this function builds its `RecipeCandidate` inline for the eligibility check — give that literal `suitable_bases: []`, with a comment, since only the diet fields are consulted:

```ts
      !isRecipeEligible(
        {
          id: row.accompaniment_recipe_id,
          cuisine: '',
          base: '',
          diet_class: row.recipes.diet_class,
          jain_ok: row.recipes.jain_ok,
          allergens: row.recipes.allergens,
          // Unused here: isRecipeEligible consults only the diet fields, and
          // accompaniments are already basis-gated by their caller (only
          // 'full' meals seed accompaniments at all).
          suitable_bases: [],
        },
        members
      )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run from `/app`: `npm run test:unit`

Expected: PASS, 16 tests total (10 from Task 1 + 6 here).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/create_poll/select-options.ts app/e2e/unit/select-options.spec.ts
git commit -m "Give each meal its own suggestions, drawn from its own basis"
```

---

### Task 3: The shared "meals due this tick" query

All three functions need the same thing: active meals joined to their flat. Writing it once keeps the three from drifting apart.

**Files:**
- Create: `supabase/functions/_shared/flat-meals.ts`
- Modify: `supabase/functions/_shared/pipeline-errors.ts`

**Interfaces:**
- Produces:
  - `interface FlatMealRow { id, flat_id, name, basis, serve_time, open_offset_min, close_time, dispatch_offset_min }`
  - `fetchActiveFlatMeals(admin): Promise<FlatMealRow[]>`
  - `serializeError(err: unknown): Record<string, unknown>` (in `pipeline-errors.ts`)

- [ ] **Step 1: Create the shared query module**

Create `supabase/functions/_shared/flat-meals.ts`:

```ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// One row per meal a flat serves (part 1's flat_meals table). This replaced
// flats.poll_open_time/poll_close_time/dispatch_time as the pipeline's unit of
// scheduling — a flat with breakfast and dinner has two rows and gets two
// independent polls a day.
export interface FlatMealRow {
  id: string;
  flat_id: string;
  name: string;
  basis: string;
  serve_time: string;
  open_offset_min: number;
  close_time: string;
  dispatch_offset_min: number;
}

// Every active meal across every flat. The functions run on a dumb 15-minute
// pg_cron heartbeat and self-select what is due, so this is deliberately
// unfiltered — the due-check is wall-clock arithmetic in TypeScript
// (see ist-time.ts), not a SQL predicate.
export async function fetchActiveFlatMeals(admin: SupabaseClient): Promise<FlatMealRow[]> {
  const { data, error } = await admin
    .from('flat_meals')
    .select('id, flat_id, name, basis, serve_time, close_time, open_offset_min, dispatch_offset_min')
    .eq('is_active', true)
    .order('flat_id', { ascending: true })
    .order('position', { ascending: true });

  if (error) throw error;
  return (data ?? []) as FlatMealRow[];
}
```

- [ ] **Step 2: Add proper error serialization**

A `PostgrestError` is a plain object, not an `Error` instance, so the existing `err instanceof Error ? err.message : String(err)` at every catch site falls through to `String(err)` and records the literal string `"[object Object]"`. This actually happened during part 1 and made a live outage undiagnosable.

Append to `supabase/functions/_shared/pipeline-errors.ts`:

```ts
// Supabase's PostgrestError is a plain object, NOT an Error instance — so the
// obvious `err instanceof Error ? err.message : String(err)` records the
// literal string "[object Object]" for exactly the failures worth debugging.
// That happened during part 1 and left a live create_poll outage with no
// diagnosable detail. Keep every field the client gives us.
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    return {
      message: typeof e.message === 'string' ? e.message : JSON.stringify(err),
      code: e.code,
      details: e.details,
      hint: e.hint,
    };
  }
  return { message: String(err) };
}
```

- [ ] **Step 3: Commit**

No test cycle of its own — this is a query wrapper against the live DB plus a pure helper whose behavior is asserted through the functions that use it in Tasks 4–6.

```bash
git add supabase/functions/_shared/flat-meals.ts supabase/functions/_shared/pipeline-errors.ts
git commit -m "Share the active-meals query and serialize pipeline errors properly"
```

---

### Task 4: `create_poll` iterates meals

**Files:**
- Modify: `supabase/functions/create_poll/index.ts`

**Interfaces:**
- Consumes: `fetchActiveFlatMeals`, `FlatMealRow` (Task 3); `eventMomentIst`, `istDateStringOffset`, `isMomentDue` (Task 1); `selectPollOptions` with `flatMealId`/`basis` (Task 2); `serializeError` (Task 3).

- [ ] **Step 1: Rewrite the request handler**

Replace the `Deno.serve` block and the `flats` query in `supabase/functions/create_poll/index.ts`. Imports become:

```ts
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
```

The handler:

```ts
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
```

- [ ] **Step 2: Rewrite the per-meal body**

Replace `createPollForFlat` entirely with `createPollForMeal`. It returns `boolean` — `true` for success or a legitimate no-op, `false` for a logged failure — so the handler can count honestly.

```ts
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
    const cutoffDate = new Date(pollDate);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - RECENT_DAYS_EXCLUSION);
    const { data: recentCartRows, error: recentError } = await admin
      .from('cart_items')
      .select('recipe_id, daily_polls!inner(flat_id, status, poll_date, flat_meals!inner(basis))')
      .eq('daily_polls.flat_id', flatId)
      .eq('daily_polls.status', 'dispatched')
      .eq('daily_polls.flat_meals.basis', meal.basis)
      .gte('daily_polls.poll_date', cutoffDate.toISOString().slice(0, 10));
    if (recentError) throw recentError;

    const recentlyServedRecipeIds = new Set((recentCartRows ?? []).map((row) => row.recipe_id));

    // VERIFY THIS QUERY EXPLICITLY (Step 5 below). The two-level embedded
    // filter `daily_polls.flat_meals.basis` is the one construct in this plan
    // that could not be checked without a service-role key. If PostgREST does
    // not apply the nested predicate, the symptom is SILENT: the exclusion set
    // comes back empty or unscoped, and the only visible effect is repeated or
    // over-suppressed suggestions days later. If it misbehaves, fall back to
    // resolving the flat's meal ids for this basis in a separate query and
    // filtering on `daily_polls.flat_meal_id=in.(...)` instead, which uses only
    // single-level embedding. Equivalent SQL, confirmed against the live
    // project, returns 2 rows for basis='full' and 0 for basis='breakfast' on
    // flat 2acbe7c1 — the new query must reproduce that.

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
```

Also update the file's header comment — it still describes per-flat scheduling:

```ts
// create_poll — runs every 15 min via pg_cron; for each ACTIVE MEAL whose
// open moment (serve_time minus open_offset_min, on a candidate serving date)
// falls in this window, generates that meal's suggestion list: up to 3
// main-course suggestions, plus up to 3 accompaniment suggestions for
// 'full'-basis meals only.
```

- [ ] **Step 3: Deploy**

```bash
npx supabase functions deploy create_poll --project-ref pcmtsfcjzoivagpslpch
```

Expected: bundles and deploys with no type errors. **A bundling failure here is the type-check** — Deno isn't available locally.

- [ ] **Step 4: Verify against the live project**

Invoke directly and check both the response and `pipeline_errors` — a green body proves nothing on its own:

```bash
curl -s -X POST https://pcmtsfcjzoivagpslpch.supabase.co/functions/v1/create_poll
```

Then, from the repo root:

```bash
npx supabase db query --linked "select stage, flat_id, detail, created_at from pipeline_errors where created_at > now() - interval '10 minutes' order by created_at desc;"
```

Expected: no new `create_poll` rows. If any appear, `detail` must now be a readable JSON object — **not** `"[object Object]"`.

- [ ] **Step 5: Prove the basis-scoped exclusion query actually filters**

Before trusting the nested embed, confirm it returns what the equivalent SQL returns. Flat `2acbe7c1-11dd-40bf-b5e2-5c6eef730939` has 2 dispatched cart rows under a `full` meal and 0 under `breakfast`.

Temporarily add a debug log inside `createPollForMeal`, immediately after the `recentCartRows` query:

```ts
    console.log('exclusion probe', {
      flat: flatId,
      basis: meal.basis,
      excluded: (recentCartRows ?? []).length,
    });
```

Deploy, `curl` the function, and read the logs:

```bash
npx supabase functions logs create_poll --project-ref pcmtsfcjzoivagpslpch
```

Expected: for flat `2acbe7c1` with `basis: 'full'`, `excluded: 2`. If it logs `0`, or logs the same count regardless of basis, the nested filter is not being applied — switch to the two-query fallback described in the code comment before continuing. **Remove the debug log before committing.**

- [ ] **Step 6: Prove the two-meal case works**

Give the `testing` flat (`41c0162d-13da-4793-8a32-75fa00b396bf`) a temporary breakfast meal whose open moment is right now, run the function, and assert two distinct polls with different suggestions. Run this as one file via `npx supabase db query --linked --file <path>` — the CLI only returns the last statement's result.

```sql
-- Breakfast served 08:00 tomorrow, opening right now (IST) so this tick is due.
insert into flat_meals (flat_id, name, basis, serve_time, open_offset_min, close_time, dispatch_offset_min, position)
values (
  '41c0162d-13da-4793-8a32-75fa00b396bf',
  'Breakfast', 'breakfast', '08:00',
  greatest(1, extract(epoch from ('08:00'::time - (now() at time zone 'Asia/Kolkata')::time)) / 60 + 1440)::int,
  '07:00', 30, 1
);
```

Then `curl` create_poll, then assert:

```sql
select
  p.poll_date,
  m.name as meal,
  m.basis,
  count(o.id) as option_count,
  (select string_agg(r.name, ', ' order by r.name)
     from poll_options po join recipes r on r.id = po.recipe_id
    where po.poll_id = p.id) as suggestions
from daily_polls p
join flat_meals m on m.id = p.flat_meal_id
left join poll_options o on o.poll_id = p.id
where p.flat_id = '41c0162d-13da-4793-8a32-75fa00b396bf'
  and p.poll_date >= (now() at time zone 'Asia/Kolkata')::date
group by p.id, p.poll_date, m.name, m.basis
order by m.basis;
```

Expected: a breakfast poll dated **tomorrow**. Its `suggestions` must differ from the dinner poll's (the seed fix). Re-run `curl` once more and confirm the row count does not change (idempotency).

**Breakfast recipes do not exist yet** — part 3 curates them. So `option_count` for the breakfast row will legitimately be **0**, with a `no eligible recipes` row in `pipeline_errors` naming `basis: breakfast`. That is the correct, informative outcome and confirms the basis filter is live. Verify the *dinner* poll is unaffected.

- [ ] **Step 7: Remove the temporary meal**

```bash
npx supabase db query --linked "delete from daily_polls where flat_meal_id in (select id from flat_meals where flat_id = '41c0162d-13da-4793-8a32-75fa00b396bf' and basis = 'breakfast'); delete from flat_meals where flat_id = '41c0162d-13da-4793-8a32-75fa00b396bf' and basis = 'breakfast';"
```

Then confirm the flat is back to exactly one Dinner meal:

```bash
npx supabase db query --linked "select name, basis from flat_meals where flat_id = '41c0162d-13da-4793-8a32-75fa00b396bf';"
```

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/create_poll/index.ts
git commit -m "Create one poll per meal, on that meal's own schedule"
```

---

### Task 5: `close_poll` closes the right meal's cart

The current `.order('poll_date').limit(1)` is a **tie** when two polls share a date, and Postgres resolves it arbitrarily — closing the wrong meal's cart.

**Files:**
- Modify: `supabase/functions/close_poll/index.ts`

**Interfaces:**
- Consumes: `fetchActiveFlatMeals`, `FlatMealRow`, `serializeError`, `eventMomentIst`, `isMomentDue`, `istDateString`, `nowInIst`.

- [ ] **Step 1: Rewrite the function**

`close_time` is an absolute wall-clock time on the serving date, so unlike the other two functions this one only ever tests today — no candidate-date loop.

It still latches. A cart that misses its one closing tick stays open past its deadline, editable indefinitely, and `dispatch_cook` only acts on a `'closed'` poll — so the cook gets nothing. Latching here is the safest of the three: closing is idempotent (the update is scoped to `status = 'open'`), and a late close is strictly better than none. Because only today is in scope, the moment is built with `eventMomentIst(todayIst, meal.close_time, 0)` and compared with `isMomentDue`, replacing `isWithinCronWindow` — the time-of-day helper cannot express "already past".

```ts
// close_poll — runs every 15 min via pg_cron; for each ACTIVE MEAL whose
// close_time falls in this window, locks that meal's cart for today. There is
// no winner to compute: mains and accompaniments are both just cart_items
// lines the flat built together during the open window. Locking is enforced
// at the RLS layer (cart_items writes require daily_polls.status = 'open') —
// the cart_items rows in place at this moment ARE the snapshot, no copy needed.
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
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy close_poll --project-ref pcmtsfcjzoivagpslpch
```

- [ ] **Step 3: Verify the tie-break bug is fixed**

This is the assertion that matters most in this task: with two polls open on one date, closing one must leave the other untouched.

Set up via `--file`: create a temporary breakfast meal on the `testing` flat with `close_time` set to the current IST time (so it is due this tick) and dinner's `close_time` left alone, then insert two open polls for today.

```sql
insert into flat_meals (flat_id, name, basis, serve_time, open_offset_min, close_time, dispatch_offset_min, position)
values (
  '41c0162d-13da-4793-8a32-75fa00b396bf', 'Breakfast', 'breakfast', '08:00', 840,
  date_trunc('minute', (now() at time zone 'Asia/Kolkata'))::time, 30, 1
);

insert into daily_polls (flat_id, flat_meal_id, poll_date, status)
select '41c0162d-13da-4793-8a32-75fa00b396bf', id,
       (now() at time zone 'Asia/Kolkata')::date, 'open'
from flat_meals where flat_id = '41c0162d-13da-4793-8a32-75fa00b396bf'
on conflict (flat_id, poll_date, flat_meal_id) do update set status = 'open';

select m.name, m.basis, p.status from daily_polls p
join flat_meals m on m.id = p.flat_meal_id
where p.flat_id = '41c0162d-13da-4793-8a32-75fa00b396bf'
  and p.poll_date = (now() at time zone 'Asia/Kolkata')::date
order by m.basis;
```

Expected before: both `open`.

Then `curl -s -X POST https://pcmtsfcjzoivagpslpch.supabase.co/functions/v1/close_poll` and re-run the select.

Expected after: **breakfast `closed`, dinner still `open`.** Under the old code this was a coin flip. Also confirm `pipeline_errors` has no new rows.

- [ ] **Step 4: Clean up**

```bash
npx supabase db query --linked "delete from daily_polls where flat_meal_id in (select id from flat_meals where flat_id = '41c0162d-13da-4793-8a32-75fa00b396bf' and basis = 'breakfast'); delete from flat_meals where flat_id = '41c0162d-13da-4793-8a32-75fa00b396bf' and basis = 'breakfast'; update daily_polls set status = 'open' where flat_id = '41c0162d-13da-4793-8a32-75fa00b396bf' and poll_date = (now() at time zone 'Asia/Kolkata')::date and status = 'closed';"
```

Then verify the flat has one meal and its poll is back to `open`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/close_poll/index.ts
git commit -m "Close the meal whose window ended, not an arbitrary one"
```

---

### Task 6: `dispatch_cook` resolves per meal and names the meal

Two messages a day that both open `"Today's meal:"` are actively confusing.

**Files:**
- Modify: `supabase/functions/dispatch_cook/index.ts`
- Modify: `supabase/functions/dispatch_cook/compose-payload.ts`

**Interfaces:**
- Consumes: `fetchActiveFlatMeals`, `FlatMealRow`, `serializeError`, `eventMomentIst`, `istDateStringOffset`, `isMomentDue`.
- Produces: `composeEnglishPayload` gains a required `meal: { name: string; serveTime: string }` param; new exported `formatServeTime(serveTime: string): string` and `composeMealHeading(mealName: string, serveTime: string, pollDate: string, todayIst: string): string`.

- [ ] **Step 1: Write the failing tests for the message heading**

Create `app/e2e/unit/compose-payload.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import {
  composeEnglishPayload,
  composeMealHeading,
  formatServeTime,
} from '../../../supabase/functions/dispatch_cook/compose-payload.ts';

test('formatServeTime renders a 12-hour clock', () => {
  expect(formatServeTime('08:00:00')).toBe('8:00am');
  expect(formatServeTime('20:30:00')).toBe('8:30pm');
  expect(formatServeTime('12:00:00')).toBe('12:00pm');
  expect(formatServeTime('00:30:00')).toBe('12:30am');
});

test('composeMealHeading says today for the current serving date', () => {
  expect(composeMealHeading('Dinner', '20:30:00', '2026-08-13', '2026-08-13')).toBe(
    'Dinner today (8:30pm)'
  );
});

test('composeMealHeading says tomorrow for the next serving date', () => {
  // Breakfast is dispatched the evening before it is served, so the cook must
  // be told which day the food is for.
  expect(composeMealHeading('Breakfast', '08:00:00', '2026-08-14', '2026-08-13')).toBe(
    'Breakfast tomorrow (8:00am)'
  );
});

test('composeMealHeading passes a custom meal name through verbatim', () => {
  // flat_meals.name is free text the flat chose — never normalized.
  expect(composeMealHeading('Sunday Brunch', '11:00:00', '2026-08-13', '2026-08-13')).toBe(
    'Sunday Brunch today (11:00am)'
  );
});

test('composeEnglishPayload leads with the meal heading', () => {
  const payload = composeEnglishPayload({
    dishes: [
      {
        recipeId: 'r1',
        name: 'Poha',
        quantity: 3,
        instructions: 'Soak the poha. Fry.',
        ingredients: [
          {
            name_en: 'poha',
            name_hi: null,
            name_kn: null,
            qty_per_person: 50,
            unit: 'g',
            is_staple: false,
            sort_order: 1,
          },
        ],
      },
    ],
    flatNote: null,
    meal: { name: 'Breakfast', serveTime: '08:00:00' },
    pollDate: '2026-08-14',
    todayIst: '2026-08-13',
  });

  expect(payload.startsWith('Breakfast tomorrow (8:00am): Poha (for 3)')).toBe(true);
  expect(payload).toContain('Poha (3 people):');
  expect(payload).not.toContain("Today's meal:");
});
```

- [ ] **Step 2: Run to verify failure**

Run from `/app`: `npm run test:unit`

Expected: FAIL — `formatServeTime is not a function`.

- [ ] **Step 3: Implement the heading helpers**

In `supabase/functions/dispatch_cook/compose-payload.ts`, add above `composeEnglishPayload`:

```ts
// The cook reads a clock, not a 24-hour timestamp.
export function formatServeTime(serveTime: string): string {
  const [hh, mm] = serveTime.split(':').map(Number);
  const suffix = hh < 12 ? 'am' : 'pm';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, '0')}${suffix}`;
}

// With several meals a day the cook can receive more than one message, so
// each must say WHICH meal and WHEN. Meals dispatched the evening before
// (breakfast) are served tomorrow, and getting that wrong means food arriving
// a day late. The meal name is the flat's own free text and is never
// normalized or translated — only the surrounding label is.
export function composeMealHeading(
  mealName: string,
  serveTime: string,
  pollDate: string,
  todayIst: string
): string {
  const when = pollDate === todayIst ? 'today' : 'tomorrow';
  return `${mealName} ${when} (${formatServeTime(serveTime)})`;
}
```

Change `composeEnglishPayload`'s signature and first line:

```ts
export function composeEnglishPayload(params: {
  dishes: DishLine[];
  flatNote: string | null;
  meal: { name: string; serveTime: string };
  pollDate: string;
  todayIst: string;
}): string {
  const { dishes, flatNote, meal, pollDate, todayIst } = params;

  const dishSummary = dishes.map((d) => `${d.name} (for ${d.quantity})`).join(', ');
  const heading = composeMealHeading(meal.name, meal.serveTime, pollDate, todayIst);
  // ... dishSections unchanged ...

  return [
    `${heading}: ${dishSummary}`,
    '',
    dishSections.join('\n\n'),
    '',
    `Note: ${flatNote && flatNote.trim() ? flatNote.trim() : '—'}`,
  ].join('\n');
}
```

- [ ] **Step 4: Run to verify the tests pass**

Run from `/app`: `npm run test:unit`

Expected: PASS, 21 tests total.

- [ ] **Step 5: Rewrite `dispatch_cook/index.ts`**

Imports gain the same helpers as `create_poll` (`eventMomentIst`, `istDateStringOffset`, `isMomentDue`, `istDateString`, `nowInIst`), plus its own `CANDIDATE_DAY_OFFSETS` and grace constant:

```ts
// A late dispatch is worse than a missed one — the cook may have already
// shopped or started — so catch-up is bounded to roughly two ticks rather
// than isMomentDue's 24h default. Long enough to survive a single failed
// cron run, short enough that nothing arrives meaningfully late.
const DISPATCH_GRACE_MINUTES = 45;
```

The handler:

```ts
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
  return new Response(JSON.stringify({ processed: due.length, failures, mode: dispatchMode }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

Rename `dispatchForFlat` to `dispatchForMeal(admin, meal, pollDate, todayIst, mode): Promise<boolean>` and change these points inside it:

The poll lookup becomes exact — same tie-break bug as `close_poll`:

```ts
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
```

Attendance gains the meal filter, matching `close_poll`:

```ts
      admin
        .from('day_attendance')
        .select('user_id, is_out')
        .eq('flat_id', flatId)
        .eq('poll_date', poll.poll_date)
        .eq('flat_meal_id', meal.id),
```

The English payload call passes the meal:

```ts
    const payloadEn = composeEnglishPayload({
      dishes,
      flatNote: poll.flat_note,
      meal: { name: meal.name, serveTime: meal.serve_time },
      pollDate: poll.poll_date,
      todayIst,
    });
```

`composeTranslatedPayload` takes a `heading: string` param and uses it in place of the hardcoded line. Add `heading` to its params type, destructure it, and replace the first array entry:

```ts
  return [
    `${heading}: ${dishSummary}`,
    `Please cook for ${headcount} people.`,
```

Pass it at the call site:

```ts
    const payloadTranslated = await composeTranslatedPayload(admin, {
      dishes,
      headcount,
      language: cook.language as 'hi' | 'kn' | 'en',
      flatNote: poll.flat_note,
      heading: composeMealHeading(meal.name, meal.serve_time, poll.poll_date, todayIst),
      fallback: payloadEn,
    });
```

Import `composeMealHeading` alongside the other compose helpers.

**Update the e2e assertion that hardcodes the old text.** `app/e2e/tests/accompaniment.spec.ts:110` asserts on the literal `"Today's meal: Dal Tadka"`, which this task deletes:

```ts
    await expect(ownerPage.getByText("Today's meal: Dal Tadka", { exact: false })).toBeVisible({ timeout: 15000 });
```

becomes:

```ts
    // The heading now names the meal and its serve time (part 2) instead of
    // the meal-neutral "Today's meal:" — a flat with breakfast and dinner
    // would otherwise send the cook two identically-headed messages.
    await expect(ownerPage.getByText('Dinner today', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(ownerPage.getByText('Dal Tadka', { exact: false }).first()).toBeVisible();
```

Note this test (`accompaniment.spec.ts:90`) is **already failing** before this change, for an unrelated pre-existing reason. Updating the string here keeps it from failing for a second, misleading reason on top; it is not expected to turn green from this edit alone. Every `return;` in the body becomes `return false;` for the two logged-error branches (`no active cook`, `empty cart at dispatch time`) and the final line becomes `return true;`. Both catch sites use `serializeError(err)`.

Update the header comment's opening line:

```ts
// dispatch_cook — runs every 15 min via pg_cron; for each ACTIVE MEAL whose
// dispatch moment (serve_time minus dispatch_offset_min, on a candidate
// serving date) falls in this window and has a 'closed' poll, composes and
// sends the cook's WhatsApp message. A flat has one active cook, so a flat
// with several meals sends that cook one message per meal per day.
```

- [ ] **Step 6: Deploy**

```bash
npx supabase functions deploy dispatch_cook --project-ref pcmtsfcjzoivagpslpch
```

- [ ] **Step 7: Verify a real dispatch names the meal**

`DISPATCH_MODE` defaults to `mock`, so this writes to `dispatch_log` without touching a BSP. Set up a closed dinner poll with a cart on the `testing` flat, temporarily set `dispatch_offset_min` so the dispatch moment is now, `curl` the function, then:

```bash
npx supabase db query --linked "select d.status, d.mode, d.headcount, d.payload_en from dispatch_log d join daily_polls p on p.id = d.poll_id where p.flat_id = '41c0162d-13da-4793-8a32-75fa00b396bf' order by d.created_at desc limit 1;"
```

Expected: `status = 'mocked'`, and `payload_en` starts with `Dinner today (8:30pm): ` — **not** `Today's meal:`. Confirm `pipeline_errors` is clean, then restore `dispatch_offset_min` to 270 and verify.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/dispatch_cook/index.ts supabase/functions/dispatch_cook/compose-payload.ts app/e2e/unit/compose-payload.spec.ts app/e2e/tests/accompaniment.spec.ts
git commit -m "Tell the cook which meal each message is for"
```

---

### Task 7: Regression pass and documentation

The single-meal case is the one all 7 live flats are in. It must be provably unchanged.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Prove the schedule is unchanged for every live flat**

The migration's offsets were verified to reproduce each flat's original columns exactly. Re-assert that after the rewrite, so a drift shows up as a failed row rather than a missed dispatch:

```bash
npx supabase db query --linked "select f.name, f.poll_open_time, f.poll_close_time, f.dispatch_time, (f.poll_open_time = (m.serve_time - make_interval(mins => m.open_offset_min))::time and f.poll_close_time = m.close_time and f.dispatch_time = (m.serve_time - make_interval(mins => m.dispatch_offset_min))::time) as schedule_matches from flats f join flat_meals m on m.flat_id = f.id order by f.name;"
```

Expected: `schedule_matches = true` for all 7 rows. A `false` means the functions would now fire at a different wall-clock time than before this change — a real regression.

- [ ] **Step 2: Run the full test suites**

From `/app`:

```bash
npm run test:unit
npx tsc --noEmit
npm run test:e2e
```

Expected: unit tests all pass; typecheck clean.

For e2e, the honest baseline is **26 passed / 2 failed**, the two failures being the pre-existing `accompaniment.spec.ts` cases (`:47`, `:90`). Those two were already failing before this part and are **not** expected to be fixed by it — `:90` additionally had its dispatch-heading assertion updated in Task 6, which does not by itself make it pass.

Any *other* e2e failure is a regression from this part and must be fixed before committing. Compare against the baseline rather than assuming: if a test outside `accompaniment.spec.ts` fails, it is this work.

Several specs exercise the pipeline end-to-end (`poll-lifecycle`, `grocery-and-dispatch`), so they are the real signal that the single-meal path is unchanged.

- [ ] **Step 3: Watch a real cron tick**

The functions are invoked by pg_cron every 15 minutes. Confirm a real unattended tick behaves, rather than only manual curls:

```bash
npx supabase db query --linked "select stage, flat_id, detail, created_at from pipeline_errors where created_at > now() - interval '1 hour' order by created_at desc limit 20;"
```

Expected: no rows from any of the three stages. Also confirm today's polls exist for every flat whose open moment has passed:

```bash
npx supabase db query --linked "select f.name, m.name as meal, p.status, p.poll_date from flats f join flat_meals m on m.flat_id = f.id left join daily_polls p on p.flat_id = f.id and p.flat_meal_id = m.id and p.poll_date = (now() at time zone 'Asia/Kolkata')::date order by f.name;"
```

- [ ] **Step 4: Prove an edited poll time takes effect the same day**

The latch's user-visible purpose. Before this part, moving a meal's open time to a moment the current tick had already passed meant no poll was created that day at all.

Pick a test flat (never one of the live pilot flats) and set its open moment a few minutes in the past, so no future 15-minute window can contain it:

```bash
npx supabase db query --linked "update flat_meals set open_offset_min = (extract(epoch from (serve_time - (now() at time zone 'Asia/Kolkata')::time)) / 60)::int + 5 where flat_id = '<test-flat-id>' returning id, serve_time, open_offset_min;"
```

Delete any poll already created for that meal today, then invoke the function directly:

```bash
curl -s -X POST https://pcmtsfcjzoivagpslpch.supabase.co/functions/v1/create_poll
```

Expected: a `daily_polls` row now exists for that meal and date. Under the old window matching this produced nothing, because the open moment sat between ticks. Re-run the same curl and confirm the row is unchanged — the latch must be idempotent, not create a second poll.

Restore the test flat's original `open_offset_min` afterwards.

- [ ] **Step 5: Correct the stale line in `CLAUDE.md`**

It currently reads `- No test runner is configured yet.` under the `/app` commands, which is no longer true and misleads the next session into skipping verification. Replace with:

```markdown
- `npm run test:unit` — pure unit tests over `supabase/functions/**` shared logic (Playwright as a plain test runner; no browser, no server, runs in ~1s)
- `npm run test:e2e` — Playwright e2e against the live Supabase project (boots Expo web on :8081)
```

Also update the repo-status paragraph, which still describes the pipeline as per-flat. Change the `/supabase` sentence to note that all three functions now iterate `flat_meals` and schedule each meal independently, and that `flats.poll_open_time`/`poll_close_time`/`dispatch_time` are still read by the app but no longer by the pipeline (part 3 removes them).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "Document the unit suite and the per-meal pipeline"
```

---

## Deferred to part 3 (deliberately not in this plan)

The spec's "Grocery list — cross-meal" and "Streak" sections specify *semantics* but their implementation is in `app/src/hooks/`, which this part does not touch:

- `use-grocery-list.ts` — merge every locked poll in a forward 24-hour window, sum shared ingredients, keep per-dish attribution, dedupe staples.
- `use-streak.ts` — a day is unbroken if **any** meal dispatched.
- The four `.maybeSingle()` poll lookups that throw once a flat has two polls on one date.

**Consequence to carry forward:** after this part, the *pipeline* supports several meals per flat but the *app* still breaks on the second poll. So no group may be given a second meal in production until part 3 ships. The verification steps above create temporary second meals and delete them within the same task for exactly this reason.
