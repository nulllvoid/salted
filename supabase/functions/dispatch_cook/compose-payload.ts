import { scaleIngredientLabel } from './scale-ingredient.ts';

export interface RecipeIngredientRow {
  name_en: string;
  name_hi: string | null;
  name_kn: string | null;
  qty_per_person: number;
  unit: string;
  is_staple: boolean;
  sort_order: number;
}

// One cart line: a dish plus its own quantity (headcount-equivalent),
// method, and ingredients. Mains, accompaniments, and sides are all just
// dishes now — no distinction at this layer, only via
// docs/06-whatsapp-integration.md's caller-side ordering (mains first, then
// accompaniments, then sides).
export interface DishLine {
  recipeId: string;
  name: string;
  quantity: number;
  instructions: string;
  ingredients: RecipeIngredientRow[];
}

// 24h "HH:MM[:SS]" to a 12-hour clock the cook reads at a glance.
export function formatServeTime(serveTime: string): string {
  const [hh, mm] = serveTime.split(':').map(Number);
  const suffix = hh < 12 ? 'am' : 'pm';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, '0')}${suffix}`;
}

// Names the meal and the day it is for. A flat with two meals gets two
// messages a day; both opening "Today's meal:" was actively confusing. The
// day matters because a meal can be dispatched the evening before it is
// served — breakfast dispatched at 22:00 is for TOMORROW.
export function composeMealHeading(
  mealName: string,
  serveTime: string,
  pollDate: string,
  todayIst: string
): string {
  const when = pollDate === todayIst ? 'today' : 'tomorrow';
  return `${mealName} ${when} (${formatServeTime(serveTime)})`;
}

// In-app preview payload (cook-message-preview screen) — NOT constrained by
// the WhatsApp template's fixed slots, since it's just displayed text. Full
// multi-dish block, one section per dish.
export function composeEnglishPayload(params: {
  dishes: DishLine[];
  flatNote: string | null;
  meal: { name: string; serveTime: string };
  pollDate: string;
  todayIst: string;
}): string {
  const { dishes, flatNote, meal, pollDate, todayIst } = params;

  const dishSummary = dishes.map((d) => `${d.name} (for ${d.quantity})`).join(', ');
  const heading = composeMealHeading(meal.name, meal.serveTime, pollDate, todayIst);

  const dishSections = dishes.map((dish) => {
    const sorted = [...dish.ingredients].sort((a, b) => a.sort_order - b.sort_order);
    const buyList = sorted.filter((i) => !i.is_staple);
    const staples = sorted.filter((i) => i.is_staple);

    const ingredientLines = buyList
      .map((i) => `${i.name_en} — ${scaleIngredientLabel(i.qty_per_person, i.unit, dish.quantity)}`)
      .join(', ');
    const stapleLine = staples.length > 0 ? ` Check you have: ${staples.map((i) => i.name_en).join(', ')}.` : '';

    return [
      `${dish.name} (${dish.quantity} ${dish.quantity === 1 ? 'person' : 'people'}):`,
      `Ingredients: ${ingredientLines}.${stapleLine}`,
      `Method:\n${dish.instructions}`,
    ].join('\n');
  });

  return [
    `${heading}: ${dishSummary}`,
    '',
    dishSections.join('\n\n'),
    '',
    `Note: ${flatNote && flatNote.trim() ? flatNote.trim() : '—'}`,
  ].join('\n');
}

// {{4}}/{{5}}-bound compositions for the approved 6-slot WhatsApp template
// (docs/06-whatsapp-integration.md) — its surrounding text is fixed
// ("Please cook for {{3}} people") and can't be re-shaped per dish without
// re-submitting the template for Meta approval, so {{3}} stays the flat's
// total headcount and all per-dish detail (name, quantity, ingredients,
// method) is pushed into the two free-text slots instead.
export function composeIngredientLine(
  dishes: DishLine[],
  lang: 'hi' | 'kn' | 'en'
): string {
  return dishes
    .map((dish) => {
      const sorted = [...dish.ingredients].filter((i) => !i.is_staple).sort((a, b) => a.sort_order - b.sort_order);
      const line = sorted
        .map((i) => {
          const name = lang === 'hi' ? (i.name_hi ?? i.name_en) : lang === 'kn' ? (i.name_kn ?? i.name_en) : i.name_en;
          return `${name} — ${scaleIngredientLabel(i.qty_per_person, i.unit, dish.quantity)}`;
        })
        .join(', ');
      return `${dish.name} (for ${dish.quantity}): ${line}`;
    })
    .join('. ');
}

export function composeMethodLine(dishes: DishLine[], translatedInstructions: Map<string, string>): string {
  return dishes
    .map((dish) => `For the ${dish.name}: ${translatedInstructions.get(dish.recipeId) ?? dish.instructions}`)
    .join('\n\n');
}
