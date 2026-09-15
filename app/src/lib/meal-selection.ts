import { nextMeal, type Meal } from './meal-schedule';

export function resolveMealSelection(
  meals: Meal[],
  selection: { meal?: string; offset?: number },
  now = Date.now(),
) {
  const explicit = meals.find((meal) => meal.id === selection.meal);
  const upcoming = nextMeal(meals, now);
  return {
    meal: explicit ?? upcoming?.meal ?? null,
    // Undefined means automatic. Zero is an explicit choice of Today.
    offset: selection.offset ?? (explicit ? 0 : (upcoming?.dayOffset ?? 0)),
  };
}
