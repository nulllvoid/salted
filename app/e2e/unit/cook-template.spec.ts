import { test, expect } from '@playwright/test';
import { composeTemplateVariables } from '../../../supabase/functions/dispatch_cook/compose-template';

function dish(name: string, quantity: number) {
  return { recipeId: `id-${name}`, name, quantity, instructions: '', ingredients: [] };
}

test('dish list leads with the count so names containing brackets stay readable', () => {
  const vars = composeTemplateVariables({
    cookName: 'Sunita',
    dishes: [dish('Akki Rotti (Rice Flatbread)', 5), dish('Paneer Kurma', 2)],
    note: null,
  });
  expect(vars).toEqual(['Sunita', '5 × Akki Rotti (Rice Flatbread), 2 × Paneer Kurma', '—']);
});

test('per-dish counts are independent, not a single headcount', () => {
  const [, dishes] = composeTemplateVariables({
    cookName: 'Sunita',
    dishes: [dish('Dal', 2), dish('Chicken', 1), dish('Rice', 3)],
    note: null,
  });
  expect(dishes).toBe('2 × Dal, 1 × Chicken, 3 × Rice');
});

test('a note is carried through and an empty one falls back to a dash', () => {
  const withNote = composeTemplateVariables({
    cookName: 'Sunita', dishes: [dish('Dal', 2)], note: 'kam mirch',
  });
  expect(withNote[2]).toBe('kam mirch');
  for (const blank of [null, '', '   ']) {
    expect(composeTemplateVariables({
      cookName: 'Sunita', dishes: [dish('Dal', 2)], note: blank,
    })[2]).toBe('—');
  }
});

// Meta rejects a template variable containing newlines or runs of more than
// four spaces, so a note typed across several lines must be flattened rather
// than passed through and refused at send time.
test('newlines and long space runs never reach a variable', () => {
  const vars = composeTemplateVariables({
    cookName: 'Sunita',
    dishes: [dish('Dal', 2)],
    note: 'less spicy\nextra rotis\r\nfor Ravi     please',
  });
  for (const value of vars) {
    expect(value).not.toMatch(/[\r\n]/);
    expect(value).not.toMatch(/ {5}/);
  }
  expect(vars[2]).toBe('less spicy extra rotis for Ravi please');
});

// The 1024 limit applies to the rendered message, so an absurd note must be
// trimmed here rather than rejected by Meta and lost.
test('an oversized note is trimmed instead of failing the send', () => {
  const vars = composeTemplateVariables({
    cookName: 'Sunita', dishes: [dish('Dal', 2)], note: 'x'.repeat(2000),
  });
  expect(vars[2].length).toBeLessThanOrEqual(600);
  expect(vars[2].endsWith('…')).toBe(true);
});

test('an empty cart is refused rather than sending a blank menu', () => {
  expect(() => composeTemplateVariables({ cookName: 'Sunita', dishes: [], note: null }))
    .toThrow(/no dishes/i);
});
