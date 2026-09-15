import { test, expect } from '@playwright/test';
import { conciseCookMessage } from '../../src/lib/concise-cook-message';

test('legacy recipes keep servings and household notes without methods', () => {
  expect(conciseCookMessage('Dinner today (8:30pm): Roti (for 2)\n\nRoti (2 people):\nIngredients: Flour\nMethod:\nKnead and cook.\n\nNote: No chilli')).toBe('Dinner today (8:30pm): Roti (for 2)\n\nNote: No chilli');
});

test('empty notes disappear and concise payloads pass through', () => {
  expect(conciseCookMessage('Dinner: Roti (for 2)\nIngredients: Flour\nMethod:\nCook\nNote: —')).toBe('Dinner: Roti (for 2)');
  expect(conciseCookMessage('Dinner: Roti (for 2)')).toBe('Dinner: Roti (for 2)');
});
