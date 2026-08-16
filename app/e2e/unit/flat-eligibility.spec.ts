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
