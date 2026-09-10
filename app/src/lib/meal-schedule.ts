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
export function nextMeal(meals: Meal[], now = Date.now()) {
  const sorted = [...meals].sort((a, b) =>
    a.serve_time.localeCompare(b.serve_time),
  );
  return (
    sorted.find((m) => mealMoment(istDate(now), m.serve_time) > now) ??
    sorted[0] ??
    null
  );
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
