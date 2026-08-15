import { test, expect } from '@playwright/test';
import {
  filterByBasis,
  selectPollOptions,
  type RecipeCandidate,
} from '../../../supabase/functions/create_poll/select-options.ts';

const MEMBERS = [{ diet_type: 'nonveg', is_jain: false, allergies: [] as string[] }];

function recipe(id: string, over: Partial<RecipeCandidate> = {}): RecipeCandidate {
  return {
    id,
    cuisine: over.cuisine ?? `cuisine-${id}`,
    base: over.base ?? `base-${id}`,
    diet_class: over.diet_class ?? 'veg',
    jain_ok: over.jain_ok ?? true,
    allergens: over.allergens ?? [],
    suitable_bases: over.suitable_bases ?? ['full'],
  };
}

// A pool big enough that the seeded shuffle has real freedom — with <= 3
// candidates every seed returns the same set and the seed test is vacuous.
const POOL = Array.from({ length: 20 }, (_, i) =>
  recipe(`r${i}`, { suitable_bases: ['breakfast', 'light', 'full'] })
);

test('two meals on the same day get different suggestions', () => {
  const common = {
    flatId: 'flat-1',
    pollDate: '2026-08-13',
    members: MEMBERS,
    eligibleRecipes: POOL,
    recentlyServedRecipeIds: new Set<string>(),
    basis: 'full',
  };
  const breakfast = selectPollOptions({ ...common, flatMealId: 'meal-breakfast' });
  const dinner = selectPollOptions({ ...common, flatMealId: 'meal-dinner' });

  expect(breakfast).toHaveLength(3);
  expect(dinner).toHaveLength(3);
  // This is the actual bug being fixed: without flatMealId in the seed these
  // two arrays are byte-identical.
  expect(breakfast).not.toEqual(dinner);
});

test('the same meal on the same day is still deterministic', () => {
  const args = {
    flatId: 'flat-1',
    pollDate: '2026-08-13',
    flatMealId: 'meal-dinner',
    members: MEMBERS,
    eligibleRecipes: POOL,
    recentlyServedRecipeIds: new Set<string>(),
    basis: 'full',
  };
  // Idempotency is a stated repo invariant (CLAUDE.md): re-running create_poll
  // for a flat/day/meal must not change results.
  expect(selectPollOptions(args)).toEqual(selectPollOptions(args));
});

test('filterByBasis keeps only recipes tagged for that basis', () => {
  const pool = [
    recipe('poha', { suitable_bases: ['breakfast'] }),
    recipe('dal', { suitable_bases: ['full'] }),
    recipe('khichdi', { suitable_bases: ['light', 'full'] }),
  ];
  expect(filterByBasis(pool, 'breakfast').map((r) => r.id)).toEqual(['poha']);
  expect(filterByBasis(pool, 'light').map((r) => r.id)).toEqual(['khichdi']);
  expect(filterByBasis(pool, 'full').map((r) => r.id).sort()).toEqual(['dal', 'khichdi']);
});

test('selectPollOptions excludes recipes not suitable for the basis', () => {
  const pool = [
    ...Array.from({ length: 5 }, (_, i) => recipe(`b${i}`, { suitable_bases: ['breakfast'] })),
    ...Array.from({ length: 5 }, (_, i) => recipe(`f${i}`, { suitable_bases: ['full'] })),
  ];
  const picked = selectPollOptions({
    flatId: 'flat-1',
    pollDate: '2026-08-13',
    flatMealId: 'meal-breakfast',
    members: MEMBERS,
    eligibleRecipes: pool,
    recentlyServedRecipeIds: new Set<string>(),
    basis: 'breakfast',
  });
  expect(picked).toHaveLength(3);
  expect(picked.every((id) => id.startsWith('b'))).toBe(true);
});

test('an empty basis pool returns no options rather than falling back', () => {
  // Suggesting dinner food for breakfast would be worse than suggesting
  // nothing — the dietary veto and the basis filter are both hard filters.
  const picked = selectPollOptions({
    flatId: 'flat-1',
    pollDate: '2026-08-13',
    flatMealId: 'meal-breakfast',
    members: MEMBERS,
    eligibleRecipes: [recipe('dal', { suitable_bases: ['full'] })],
    recentlyServedRecipeIds: new Set<string>(),
    basis: 'breakfast',
  });
  expect(picked).toEqual([]);
});
