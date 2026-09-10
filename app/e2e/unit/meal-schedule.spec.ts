import { test, expect } from '@playwright/test';
import { mealDefaults, validateMeal, nextMeal, istDate, mealMoment, type Meal } from '../../src/lib/meal-schedule';
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
  expect(nextMeal(meals, mealMoment('2026-09-10', '09:00'))?.name).toBe('Lunch');
  expect(nextMeal(meals, mealMoment('2026-09-10', '23:00'))?.name).toBe('Breakfast');
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
