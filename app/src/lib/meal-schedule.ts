import type { Tables } from '../types/database';

export type Meal = Tables<'flat_meals'>;
export const mealDefaults = {
  breakfast: {
    name: 'Breakfast',
    basis: 'breakfast',
    serve_time: '08:30',
    close_time: '07:00',
    open_offset_min: 720,
    dispatch_offset_min: 60,
  },
  lunch: {
    name: 'Lunch',
    basis: 'full',
    serve_time: '13:00',
    close_time: '10:00',
    open_offset_min: 300,
    dispatch_offset_min: 120,
  },
  dinner: {
    name: 'Dinner',
    basis: 'full',
    serve_time: '20:30',
    close_time: '16:00',
    open_offset_min: 690,
    dispatch_offset_min: 270,
  },
} as const;

export function istDate(now = Date.now()) {
  return new Date(now + 330 * 60000).toISOString().slice(0, 10);
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function mealMoment(date: string, time: string) {
  return Date.parse(`${date}T${time.slice(0, 5)}:00+05:30`);
}
export function formatMealTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
// The meal to show by default, WITH the day it belongs to.
//
// The day is the whole point: once the last meal of the day has been served,
// the earliest meal comes back round, but it is tomorrow's. Returning it
// against today's date put an already-dispatched breakfast on the Today screen
// late at night while tomorrow's open poll — which create_poll had already
// opened, since a breakfast poll opens 12h before an 08:30 serve — sat unshown.
//
// Callers pair `dayOffset` with the date, never assuming today: `pollDate` is
// derived as addDays(istDate(), offset).
export function nextMeal(
  meals: Meal[],
  now = Date.now(),
): { meal: Meal; dayOffset: number } | null {
  const sorted = [...meals].sort((a, b) =>
    a.serve_time.localeCompare(b.serve_time),
  );
  // Strictly greater than: at exactly the serve time the meal is being served,
  // not upcoming, so it rolls to tomorrow with the rest.
  const upcoming = sorted.find(
    (m) => mealMoment(istDate(now), m.serve_time) > now,
  );
  if (upcoming) return { meal: upcoming, dayOffset: 0 };
  return sorted[0] ? { meal: sorted[0], dayOffset: 1 } : null;
}

// The status word above the menu list.
//
// Takes the cart size, not just the status, because an empty cart makes two of
// these labels lies: a closed-but-empty menu announced "CONFIRMED" directly
// above "No dishes were chosen before the menu closed", and a dispatched-but-
// empty one claimed "PREPARED" when nothing was ever sent.
export function menuStatusLabel(
  status: string,
  cartLineCount: number,
): string {
  if (status === 'open') return 'EDITING OPEN';
  if (cartLineCount === 0) return 'NO DISHES';
  return status === 'dispatched' ? 'PREPARED' : 'CONFIRMED';
}
export function validateMeal(
  meal: Pick<
    Meal,
    | 'name'
    | 'serve_time'
    | 'close_time'
    | 'open_offset_min'
    | 'dispatch_offset_min'
  >,
): string | null {
  if (!meal.name.trim() || meal.name.trim().length > 60)
    return 'Give this meal a name of 1–60 characters.';
  if (
    ![meal.serve_time, meal.close_time].every((t) =>
      /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(t),
    )
  )
    return 'Use a 24-hour time, such as 20:30.';
  if (![meal.open_offset_min, meal.dispatch_offset_min].every(Number.isInteger))
    return 'Enter whole minutes for the scheduling offsets.';
  if (
    meal.open_offset_min <= 0 ||
    meal.open_offset_min > 1440 ||
    meal.dispatch_offset_min < 0 ||
    meal.dispatch_offset_min > 2880
  )
    return 'Open menus up to 24 hours before serving, and prepare messages after the menu closes.';
  const serve = mealMoment('2026-01-01', meal.serve_time);
  const close = mealMoment('2026-01-01', meal.close_time);
  if (close >= serve) return 'The menu must close before the meal is served.';
  if (serve - meal.open_offset_min * 60000 >= close)
    return 'Open the menu before it closes.';
  if (serve - meal.dispatch_offset_min * 60000 < close)
    return 'Send cook instructions at or after the menu closes.';
  return null;
}

export function formatMealDate(date: string) {
  return new Date(`${date}T00:00:00+05:30`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

// Copy for the Today screen's "there is no poll yet" card.
//
// The screen shows this whenever the cart query returns nothing, but that one
// state has three genuinely different causes and they need different words.
// Deriving them from the clock keeps the heading from contradicting the time
// printed underneath it: a meal created AFTER its own opening moment (the
// latch then makes it due on the next 15-minute tick) used to be announced as
// "A little early" above an opening time already hours in the past.
export function suggestionsPendingCopy(
  meal: Pick<Meal, 'serve_time' | 'close_time' | 'open_offset_min'>,
  pollDate: string,
  now = Date.now(),
): { title: string; detail: string; canRefresh: boolean } {
  const opensAt = mealMoment(pollDate, meal.serve_time) - meal.open_offset_min * 60000;
  const closesAt = mealMoment(pollDate, meal.close_time);

  if (now < opensAt) {
    const when = new Date(opensAt).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
    return {
      title: 'A little early',
      detail: `Suggestions open ${when} IST.`,
      canRefresh: true,
    };
  }

  // Past the close time with nothing to show: the menu never opened and no
  // amount of refreshing will change that, so don't invite it.
  if (now >= closesAt) {
    return {
      title: 'No menu for this meal',
      detail:
        'This meal closed without suggestions. Your next meal is available from the switcher above.',
      canRefresh: false,
    };
  }

  return {
    title: 'Suggestions are on their way',
    detail:
      'They are being put together now and usually appear within a few minutes. Tap Refresh suggestions if they are still missing.',
    canRefresh: true,
  };
}

// Digits for the "menu locks in" card on today's cart.
//
// Always a zero-padded clock and always to the second: the card exists to be
// watched, so a segment that sat still would read as broken. Fixed-width
// segments also keep the line from reflowing on every tick.
//
// The hours segment is dropped below an hour rather than rendered as "00:" —
// a menu closing in minutes should not look like it closes in hours.
export function formatLockCountdown(
  closesAt: number,
  now = Date.now(),
): { clock: string; closesAtLabel: string } {
  const closesAtLabel = formatMealTime(
    new Date(closesAt).toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
    }),
  );

  // Clamp rather than count upward: the poll flipping to closed normally
  // re-renders this away, but a missed realtime event must not leave a
  // negative timer on screen.
  const remaining = Math.max(closesAt - now, 0);
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return {
    clock:
      hours > 0
        ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
        : `${pad(minutes)}:${pad(seconds)}`,
    closesAtLabel,
  };
}
