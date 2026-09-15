import { test, expect } from '@playwright/test';
import { resolveMealSelection } from '../../src/lib/meal-selection';
import {
  mealDefaults,
  mealMoment,
  type Meal,
} from '../../src/lib/meal-schedule';

const meals = Object.entries(mealDefaults).map(
  ([id, defaults]) => ({ ...defaults, id }) as Meal,
);
const late = mealMoment('2026-09-14', '23:00');

test('Today overrides automatic tomorrow after the last meal', () => {
  expect(resolveMealSelection(meals, {}, late).offset).toBe(1);
  expect(resolveMealSelection(meals, { offset: 0 }, late)).toEqual({
    meal: meals[0],
    offset: 0,
  });
});

test('switching meals can preserve the day already displayed', () => {
  const current = resolveMealSelection(meals, {}, late);
  expect(
    resolveMealSelection(
      meals,
      { meal: 'lunch', offset: current.offset },
      late,
    ),
  ).toEqual({ meal: meals[1], offset: 1 });
});

test('an unavailable meal falls back safely and an empty household has no meal', () => {
  expect(
    resolveMealSelection(meals, { meal: 'removed', offset: 0 }, late).meal,
  ).toBe(meals[0]);
  expect(resolveMealSelection([], {}, late)).toEqual({ meal: null, offset: 0 });
});
