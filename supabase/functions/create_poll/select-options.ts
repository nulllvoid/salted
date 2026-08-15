// Poll option selection (docs/02-prd.md §F2, docs/03-mvp-spec.md "Daily
// pipeline" step 1):
//   1. Hard filter: union of flat members' diet_type/is_jain/allergies acts
//      as an unoverrideable veto against recipes.diet_class/jain_ok/allergens.
//   2. Exclude any recipe served to this flat in the last 10 days, derived
//      from cart_items joined to daily_polls where status='dispatched'
//      (docs/04-architecture.md "meal history ... no separate table needed").
//   3. Variety heuristic: not all 3 options share the same cuisine, and not
//      all 3 share the same base.
//   4. Deterministic: shuffled with a (flat_id, poll_date)-seeded RNG so
//      re-running create_poll for the same flat/day is idempotent even
//      before the daily_polls unique-constraint check runs.

export interface MemberDiet {
  diet_type: string; // 'veg' | 'egg' | 'nonveg'
  is_jain: boolean;
  allergies: string[];
}

export interface RecipeCandidate {
  id: string;
  cuisine: string;
  base: string;
  diet_class: string;
  jain_ok: boolean;
  allergens: string[];
  // Which meal bases this dish suits ('breakfast' | 'light' | 'full').
  // A dish can suit several — khichdi works as both a light and a full meal.
  suitable_bases: string[];
}

const DIET_RANK: Record<string, number> = { veg: 0, egg: 1, nonveg: 2 };

// A recipe is eligible only if every member's constraints are satisfied:
// nonveg members can still eat veg/egg, but a veg member can't be served
// nonveg — so the flat's ceiling is the *most restrictive* member's diet.
export function isRecipeEligible(recipe: RecipeCandidate, members: MemberDiet[]): boolean {
  const flatDietCeiling = Math.min(...members.map((m) => DIET_RANK[m.diet_type] ?? DIET_RANK.nonveg));
  if ((DIET_RANK[recipe.diet_class] ?? DIET_RANK.nonveg) > flatDietCeiling) return false;

  const anyJainMember = members.some((m) => m.is_jain);
  if (anyJainMember && !recipe.jain_ok) return false;

  const unionAllergies = new Set(members.flatMap((m) => m.allergies));
  if (recipe.allergens.some((a) => unionAllergies.has(a))) return false;

  return true;
}

// Mulberry32 — small deterministic PRNG seeded from a string, so selection
// is reproducible for a given (flat_id, poll_date) without a DB-side seed.
// Exported so close_poll's accompaniment selection can reuse it with its own
// seed string, rather than duplicating a PRNG.
export function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// A hard filter, exactly like the dietary veto: suggesting a heavy dinner
// dish for breakfast is worse than suggesting nothing, so callers must NOT
// fall back to the unfiltered pool when this empties.
export function filterByBasis(recipes: RecipeCandidate[], basis: string): RecipeCandidate[] {
  return recipes.filter((r) => r.suitable_bases?.includes(basis));
}

function hasVariety(options: RecipeCandidate[]): boolean {
  const allSameCuisine = options.every((o) => o.cuisine === options[0].cuisine);
  const allSameBase = options.every((o) => o.base === options[0].base);
  return !allSameCuisine && !allSameBase;
}

// Returns up to 3 recipe ids, or fewer if the eligible pool after exclusion
// is too small to satisfy the variety heuristic — callers should fall back
// to relaxing the 10-day exclusion first (recently-eaten is better than an
// empty poll) rather than the dietary veto (never relaxed).
export function selectPollOptions(params: {
  flatId: string;
  pollDate: string;
  flatMealId: string;
  members: MemberDiet[];
  eligibleRecipes: RecipeCandidate[];
  recentlyServedRecipeIds: Set<string>;
  basis: string;
}): string[] {
  const { flatId, pollDate, flatMealId, members, eligibleRecipes, recentlyServedRecipeIds, basis } =
    params;
  // flatMealId is in the seed so two meals on the same day get different
  // suggestions — without it breakfast and dinner draw byte-identical lists.
  const rng = seededRng(`${flatId}:${pollDate}:${flatMealId}`);

  // Both hard filters, neither ever relaxed below.
  const basisFiltered = filterByBasis(eligibleRecipes, basis);
  const dietFiltered = basisFiltered.filter((r) => isRecipeEligible(r, members));
  const notRecentlyServed = dietFiltered.filter((r) => !recentlyServedRecipeIds.has(r.id));

  // Fall back to the full diet-eligible pool if 10-day exclusion leaves too
  // few options — a repeat is better than no poll at all.
  const pool = notRecentlyServed.length >= 3 ? notRecentlyServed : dietFiltered;
  if (pool.length === 0) return [];
  if (pool.length <= 3) return shuffle(pool, rng).map((r) => r.id);

  const shuffled = shuffle(pool, rng);

  // Try consecutive windows of the shuffled pool until one satisfies the
  // variety heuristic; the seeded shuffle keeps this deterministic.
  for (let start = 0; start + 3 <= shuffled.length; start++) {
    const candidate = shuffled.slice(start, start + 3);
    if (hasVariety(candidate)) return candidate.map((r) => r.id);
  }

  // No window satisfies variety (e.g. pool has only one cuisine/base) —
  // variety is a soft heuristic, so just return the first 3.
  return shuffled.slice(0, 3).map((r) => r.id);
}

// Accompaniment (roti/rice/etc) option selection — called by create_poll
// once the day's main-course suggestions are known (no "winner" gate exists
// anymore; every recipe in poll_options is a candidate source). No 10-day
// exclusion or cuisine/base variety heuristic here — those are
// main-dish-only concerns; this just seeded-shuffles the curated,
// dietary-filtered candidate set for reproducibility.
export function selectAccompanimentOptions(params: {
  flatId: string;
  pollDate: string;
  flatMealId: string;
  validAccompaniments: { recipeId: string; sortOrder: number }[]; // pre-filtered to is_active + dietary-eligible
}): string[] {
  const { flatId, pollDate, flatMealId, validAccompaniments } = params;
  if (validAccompaniments.length === 0) return [];

  // Distinct seed suffix so this shuffle doesn't correlate with the
  // main-dish shuffle for the same (flatId, pollDate, flatMealId).
  const rng = seededRng(`${flatId}:${pollDate}:${flatMealId}:accompaniment`);
  const sorted = [...validAccompaniments].sort((a, b) => a.sortOrder - b.sortOrder);
  const shuffled = shuffle(sorted, rng);
  return shuffled.slice(0, 3).map((a) => a.recipeId);
}

// Sources accompaniment candidates for the day: the union of
// recipe_accompaniments for every recipe in the day's main-course
// suggestion list (poll_options), deduplicated, filtered to is_active +
// dietary-eligible. Every main in the cart came from poll_options (dishes
// only enter the cart via tapping a suggestion), so this guarantees any
// cart main's accompaniments are always present in the suggestion list too.
export async function selectAccompanimentOptionsForSuggestedMains(
  admin: { from: (table: string) => any },
  params: {
    flatId: string;
    pollDate: string;
    flatMealId: string;
    suggestedMainRecipeIds: string[];
    members: MemberDiet[];
  }
): Promise<string[]> {
  const { suggestedMainRecipeIds, members, flatId, pollDate, flatMealId } = params;
  if (suggestedMainRecipeIds.length === 0) return [];

  const { data: mappingRows, error } = await admin
    .from('recipe_accompaniments')
    .select(
      'accompaniment_recipe_id, sort_order, recipes:accompaniment_recipe_id(is_active, diet_class, jain_ok, allergens)'
    )
    .in('main_recipe_id', suggestedMainRecipeIds);
  if (error) throw error;

  const bestSortOrder = new Map<string, number>();
  for (const row of mappingRows ?? []) {
    if (!row.recipes?.is_active) continue;
    if (
      !isRecipeEligible(
        {
          id: row.accompaniment_recipe_id,
          cuisine: '',
          base: '',
          diet_class: row.recipes.diet_class,
          jain_ok: row.recipes.jain_ok,
          allergens: row.recipes.allergens,
          // Unused by isRecipeEligible — accompaniments are sourced from the
          // day's mains, so the meal's basis is already implied.
          suitable_bases: [],
        },
        members
      )
    ) {
      continue;
    }
    const existing = bestSortOrder.get(row.accompaniment_recipe_id);
    if (existing === undefined || row.sort_order < existing) {
      bestSortOrder.set(row.accompaniment_recipe_id, row.sort_order);
    }
  }

  const validAccompaniments = [...bestSortOrder.entries()].map(([recipeId, sortOrder]) => ({
    recipeId,
    sortOrder,
  }));

  return selectAccompanimentOptions({ flatId, pollDate, flatMealId, validAccompaniments });
}
