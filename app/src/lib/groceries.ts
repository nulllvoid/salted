import { scaleIngredient } from './scale-ingredient';
import type { GroceryLineView, IngredientUnit } from '../types/domain';
export interface GroceryContribution {
  pollId: string;
  ingredientId: string;
  nameEn: string;
  nameHi: string | null;
  nameKn: string | null;
  dishName: string;
  quantity: number;
  unit: IngredientUnit;
  category: GroceryLineView['category'];
  isStaple: boolean;
  checked: boolean;
}
export interface ShoppingLine extends GroceryLineView {
  sources: { pollId: string; ingredientId: string }[];
}
export function mergeGroceries(items: GroceryContribution[]): ShoppingLine[] {
  const groups = new Map<
    string,
    { line: ShoppingLine; quantity: number; dishes: Set<string> }
  >();
  for (const item of items) {
    // Never combine unlike units or staples with fresh ingredients.
    const key = JSON.stringify([
      item.nameEn.trim().toLowerCase(),
      item.unit,
      item.isStaple,
    ]);
    let group = groups.get(key);
    if (!group) {
      group = {
        quantity: 0,
        dishes: new Set(),
        line: {
          ...item,
          ingredientId: key,
          quantityLabel: '',
          sources: [],
          checked: true,
        },
      };
      groups.set(key, group);
    }
    group.quantity += item.quantity;
    group.dishes.add(item.dishName);
    group.line.checked = group.line.checked && item.checked;
    group.line.sources.push({
      pollId: item.pollId,
      ingredientId: item.ingredientId,
    });
  }
  return [...groups.values()].map(({ line, quantity, dishes }) => ({
    ...line,
    dishName: [...dishes].join(', '),
    quantityLabel: line.isStaple
      ? 'Check at home'
      : scaleIngredient(quantity, line.unit, 1),
  }));
}
