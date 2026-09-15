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
  expect(payload).toBe('Breakfast tomorrow (8:00am): Poha (for 3)');
  expect(payload).not.toContain("Today's meal:");
});
