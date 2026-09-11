import { test, expect } from '@playwright/test';
import { mealDefaults, validateMeal, nextMeal, istDate, mealMoment, suggestionsPendingCopy, formatLockCountdown, menuStatusLabel, type Meal } from '../../src/lib/meal-schedule';
import { mergeGroceries, type GroceryContribution } from '../../src/lib/groceries';

test('meal schedules validate opening, locking, dispatch and midnight boundaries', () => {
  for (const meal of Object.values(mealDefaults)) expect(validateMeal(meal)).toBeNull();
  expect(validateMeal({ ...mealDefaults.breakfast, close_time: '09:00' })).toContain('before the meal');
  expect(validateMeal({ ...mealDefaults.dinner, open_offset_min: 30 })).toContain('before it closes');
  expect(validateMeal({ ...mealDefaults.dinner, dispatch_offset_min: 400 })).toContain('at or after');
  expect(validateMeal({ ...mealDefaults.dinner, serve_time: '29:00' })).toContain('24-hour');
  expect(validateMeal({ ...mealDefaults.dinner, open_offset_min: 1441 })).toContain('24 hours');
});
test('date and default meal selection use IST, including the previous UTC day', () => {
  expect(istDate(Date.parse('2026-09-09T20:00:00Z'))).toBe('2026-09-10');
  const meals = Object.entries(mealDefaults).map(([id, defaults]) => ({ ...defaults, id } as Meal));
  expect(nextMeal(meals, mealMoment('2026-09-10', '09:00'))?.meal.name).toBe('Lunch');
  expect(nextMeal(meals, mealMoment('2026-09-10', '09:00'))?.dayOffset).toBe(0);
});

test('the next meal rolls to tomorrow once the last one is served', () => {
  const meals = [mealDefaults.breakfast, mealDefaults.dinner] as Meal[];

  // Mid-evening, dinner is still ahead: today's dinner, no rollover.
  const evening = nextMeal(meals, mealMoment('2026-09-11', '19:00'));
  expect(evening?.meal.name).toBe('Dinner');
  expect(evening?.dayOffset).toBe(0);

  // After the last serve time of the day, the earliest meal comes back round —
  // but it belongs to TOMORROW. Returning it against today's date is what put
  // an already-dispatched breakfast on the Today screen at 22:44 IST while
  // tomorrow's open poll sat unshown.
  const lateNight = nextMeal(meals, mealMoment('2026-09-11', '23:00'));
  expect(lateNight?.meal.name).toBe('Breakfast');
  expect(lateNight?.dayOffset).toBe(1);

  // Exactly at a serve time the meal is being served, not upcoming.
  const atDinner = nextMeal(meals, mealMoment('2026-09-11', '20:30'));
  expect(atDinner?.meal.name).toBe('Breakfast');
  expect(atDinner?.dayOffset).toBe(1);

  // A single-meal household still rolls over rather than pinning to today.
  const onlyBreakfast = nextMeal([mealDefaults.breakfast] as Meal[], mealMoment('2026-09-11', '10:00'));
  expect(onlyBreakfast?.meal.name).toBe('Breakfast');
  expect(onlyBreakfast?.dayOffset).toBe(1);

  expect(nextMeal([], mealMoment('2026-09-11', '10:00'))).toBeNull();
});

test('a closed menu with nothing in it is not announced as confirmed', () => {
  // The header label sits directly above "No dishes were chosen before the
  // menu closed" — calling that state CONFIRMED contradicts the line under it.
  expect(menuStatusLabel('open', 0)).toBe('EDITING OPEN');
  expect(menuStatusLabel('open', 2)).toBe('EDITING OPEN');
  expect(menuStatusLabel('closed', 0)).toBe('NO DISHES');
  expect(menuStatusLabel('closed', 2)).toBe('CONFIRMED');
  expect(menuStatusLabel('dispatched', 0)).toBe('NO DISHES');
  expect(menuStatusLabel('dispatched', 2)).toBe('PREPARED');
});
test('shared groceries sum before rounding, retain sources and do not mix units', () => {
  const base: GroceryContribution = { pollId: 'a', ingredientId: '1', nameEn: 'Onion', nameHi: null, nameKn: null, dishName: 'Dal', quantity: 0.3, unit: 'piece', category: 'vegetable', isStaple: false, checked: true };
  const lines = mergeGroceries([base, { ...base, pollId: 'b', ingredientId: '2', dishName: 'Sabzi', checked: false }, { ...base, ingredientId: '3', quantity: 50, unit: 'g' }]);
  expect(lines).toHaveLength(2);
  expect(lines[0].quantityLabel).toBe('1');
  expect(lines[0].checked).toBe(false);
  expect(lines[0].sources).toHaveLength(2);
  expect(lines[0].dishName).toBe('Dal, Sabzi');
});

test('the no-poll empty state distinguishes early, pending and missed menus', () => {
  // Breakfast served 08:30, opening 720 min (12h) earlier = 20:30 the
  // PREVIOUS day, closing 07:00 on the serving day.
  const meal = { ...mealDefaults.breakfast } as Meal;
  const date = '2026-09-11';
  const openMoment = mealMoment(date, meal.serve_time) - meal.open_offset_min * 60000;

  // Before the open moment: genuinely early, and the copy names the time.
  const early = suggestionsPendingCopy(meal, date, openMoment - 60 * 60000);
  expect(early.title).toBe('A little early');
  expect(early.detail).toContain('10 Sept');

  // After the open moment but before the menu closes, suggestions are overdue,
  // not early — this is the state a meal lands in when it is created after its
  // own opening time, and calling it "early" contradicts the time shown.
  const pending = suggestionsPendingCopy(meal, date, openMoment + 7 * 3600000);
  expect(pending.title).not.toBe('A little early');
  expect(pending.title).toBe('Suggestions are on their way');
  expect(pending.detail).not.toContain('10 Sept');

  // Past the close time with still no menu, refreshing can never help.
  const missed = suggestionsPendingCopy(
    meal,
    date,
    mealMoment(date, meal.close_time) + 60 * 60000,
  );
  expect(missed.title).toBe('No menu for this meal');
  expect(missed.canRefresh).toBe(false);
  expect(early.canRefresh).toBe(true);
  expect(pending.canRefresh).toBe(true);
});

test('the lock countdown is a zero-padded clock that always shows seconds', () => {
  // Dinner closes 11:00 on the serving day.
  const closesAt = mealMoment('2026-09-11', '11:00');

  // The absolute close time is carried alongside the digits so the card can
  // print "Closes 11:00 AM" underneath without re-deriving it.
  expect(formatLockCountdown(closesAt, closesAt - 60000).closesAtLabel).toBe(
    '11:00 AM',
  );

  // Over an hour: hours segment present, every segment zero-padded so the
  // line never changes width as the digits roll over.
  expect(
    formatLockCountdown(closesAt, closesAt - ((1 * 60 + 48) * 60 + 32) * 1000)
      .clock,
  ).toBe('01:48:32');
  expect(
    formatLockCountdown(closesAt, closesAt - ((9 * 60 + 5) * 60 + 4) * 1000)
      .clock,
  ).toBe('09:05:04');

  // Under an hour the hours segment is dropped entirely rather than shown as
  // "00:" — a menu closing in minutes should not look like it closes in hours.
  expect(
    formatLockCountdown(closesAt, closesAt - (48 * 60 + 32) * 1000).clock,
  ).toBe('48:32');
  expect(formatLockCountdown(closesAt, closesAt - 9 * 1000).clock).toBe('00:09');

  // Exactly one hour keeps the hours segment; a second under drops it.
  expect(formatLockCountdown(closesAt, closesAt - 3600 * 1000).clock).toBe(
    '01:00:00',
  );
  expect(formatLockCountdown(closesAt, closesAt - 3599 * 1000).clock).toBe(
    '59:59',
  );

  // Never count upward past the lock: a missed status-flip event must leave
  // 00:00 on screen, not a negative or growing timer.
  expect(formatLockCountdown(closesAt, closesAt).clock).toBe('00:00');
  expect(formatLockCountdown(closesAt, closesAt + 5 * 60000).clock).toBe('00:00');
});
