// View-model types for screens — shaped from joined Supabase query results,
// not 1:1 with raw table rows (see src/types/database.ts for those).
//
// The literal unions below mirror the CHECK constraints in
// docs/05-schema.sql. Postgres CHECK constraints aren't introspectable by
// `supabase gen types`, so the generated Database type widens these columns
// to plain `string` — these are hand-kept in sync with the schema instead.

// Preset names for household creation. Live meals are flat_meals records.
export type MealType = 'breakfast' | 'lunch' | 'dinner';

export type DietType = 'veg' | 'egg' | 'nonveg';
export type Allergen = 'peanut' | 'dairy' | 'gluten' | 'shellfish' | 'soy';
export type PollStatus = 'open' | 'closed' | 'cancelled' | 'dispatched';
export type RecipeKind = 'main' | 'accompaniment' | 'side';
export type IngredientUnit =
  'piece' | 'g' | 'ml' | 'bunch' | 'packet' | 'cup' | 'tbsp' | 'tsp';
export type IngredientCategory =
  'vegetable' | 'dairy' | 'staple' | 'protein' | 'other';

// A shared, live-edited cart line (cart_items row) — one per (poll, recipe),
// NOT per-user. quantity is the single shared value all members see and
// edit.
export interface CartLineView {
  recipeId: string;
  name: string;
  cuisine: string;
  dietClass: DietType;
  kind: RecipeKind;
  quantity: number;
  updatedByDisplayName: string | null; // "last edited by X" social-proof equivalent
}

// A suggested dish (poll_options / poll_accompaniment_options row) —
// "offered," not "voted on." inCart is true once it's also a cart_items row.
export interface SuggestionView {
  recipeId: string;
  name: string;
  cuisine: string;
  dietClass: DietType;
  kind: RecipeKind;
  inCart: boolean;
}

// One row of the live "who did what" cart feed (activity_log). Written by
// the client in the same call that mutates cart_items/day_attendance — see
// docs/05-schema.sql for the table this is shaped from.
export type ActivityEntry =
  | {
      id: string;
      createdAt: string;
      actorDisplayName: string | null;
      eventType: 'cart_add';
      recipeName: string;
    }
  | {
      id: string;
      createdAt: string;
      actorDisplayName: string | null;
      eventType: 'cart_remove';
      recipeName: string;
    }
  | {
      id: string;
      createdAt: string;
      actorDisplayName: string | null;
      eventType: 'cart_quantity_change';
      recipeName: string;
      fromQty: number;
      toQty: number;
    }
  | {
      id: string;
      createdAt: string;
      actorDisplayName: string | null;
      eventType: 'attendance_change';
      isOut: boolean;
      reason: string | null;
    };

export interface TodayCartView {
  pollId: string;
  flatMealId: string; // daily_polls.flat_meal_id — the meal this poll belongs to; day_attendance keys on it
  pollDate: string;
  status: PollStatus; // semantics: 'open' = cart editable, else locked
  headcount: number;
  isOutToday: boolean;
  suggestions: SuggestionView[]; // mains + accompaniments, from poll_options + poll_accompaniment_options
  cartLines: CartLineView[]; // from cart_items
  activity: ActivityEntry[]; // from activity_log, most recent first
  isLocked: boolean; // status !== 'open'
  maxMains: number | null; // flats.max_mains — soft, warn-only cap; null = no limit set
  maxAccompaniments: number | null; // flats.max_accompaniments — covers both 'accompaniment' and 'side' cart lines combined
}

export interface GroceryLineView {
  ingredientId: string;
  dishName: string; // which cart line this ingredient belongs to
  nameEn: string;
  nameHi: string | null;
  nameKn: string | null;
  quantityLabel: string; // scaled by THIS dish's cart quantity, not headcount
  category: IngredientCategory;
  unit: IngredientUnit;
  isStaple: boolean;
  checked: boolean;
}

export interface GroceryListData {
  dishSummary: string; // "Dal (2), Bhindi (1), Aloo Jeera (1), Roti (2)" header line
  lines: GroceryLineView[]; // flat, category-grouped by the UI (each row carries its own dishName)
}

export interface DietaryProfileInput {
  dietType: DietType;
  isJain: boolean;
  allergies: Allergen[];
}
