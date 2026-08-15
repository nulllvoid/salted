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
  const tick = ist(2026, 8, 13, 9, 0);
  const moment = eventMomentIst('2026-08-13', '20:30:00', 690); // 09:00
  expect(isMomentInCronWindow(moment, tick)).toBe(isWithinCronWindow('09:00:00', tick));
  expect(isMomentInCronWindow(moment, tick)).toBe(true);
});

test('isWithinCronWindow and isMomentInCronWindow diverge mid-window, and isMomentDue is the latch', () => {
  // Mid-window the two helpers deliberately disagree, because they answer
  // different questions: isWithinCronWindow asks "has the target time passed
  // within this window" (true at 09:05 for a 09:00 target), isMomentInCronWindow
  // asks "is this moment still upcoming" (false — 09:00 is behind us).
  // Neither expresses "this is due and not yet done" past its window; that is
  // exactly the gap isMomentDue fills.
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
