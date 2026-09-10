import { useCallback, useEffect } from 'react';
import { useActiveGroup } from '@/contexts/active-group';
import { mergeGroceries, type GroceryContribution } from '@/lib/groceries';
import { supabase } from '@/lib/supabase';
import { checkResult } from '@/lib/errors';
import { useResource } from './use-resource';
export function useGroceryList(flatId: string | null | undefined) {
  const { pollDate } = useActiveGroup();
  const fetcher = useCallback(async () => {
    if (!flatId) return null;
    const { data: polls } = await supabase
      .from('daily_polls')
      .select('id, status')
      .eq('flat_id', flatId)
      .eq('poll_date', pollDate)
      .neq('status', 'cancelled')
      .throwOnError();
    if (!polls?.length) return null;
    const ids = polls.map((p) => p.id);
    const { data: cart } = await supabase
      .from('cart_items')
      .select('poll_id, recipe_id, quantity, recipes(name)')
      .in('poll_id', ids)
      .throwOnError();
    if (!cart?.length) return null;
    const [ingredients, checks] = await Promise.all([
      supabase
        .from('recipe_ingredients')
        .select('*')
        .in('recipe_id', [...new Set(cart.map((c) => c.recipe_id))])
        .order('sort_order')
        .throwOnError(),
      supabase
        .from('grocery_checks')
        .select('poll_id, ingredient_id')
        .in('poll_id', ids)
        .throwOnError(),
    ]);
    const checked = new Set(
      (checks.data ?? []).map((c) => `${c.poll_id}:${c.ingredient_id}`),
    );
    const contributions: GroceryContribution[] = cart.flatMap((c) =>
      (ingredients.data ?? [])
        .filter((i) => i.recipe_id === c.recipe_id)
        .map((i) => ({
          pollId: c.poll_id,
          ingredientId: i.id,
          nameEn: i.name_en,
          nameHi: i.name_hi,
          nameKn: i.name_kn,
          dishName: c.recipes?.name ?? 'Meal',
          quantity: i.qty_per_person * c.quantity,
          unit: i.unit as GroceryContribution['unit'],
          category: i.category as GroceryContribution['category'],
          isStaple: i.is_staple,
          checked: checked.has(`${c.poll_id}:${i.id}`),
        })),
    );
    return {
      dishSummary: [
        ...new Set(cart.map((c) => c.recipes?.name ?? 'Meal')),
      ].join(' · '),
      lines: mergeGroceries(contributions),
      provisional: polls.some((p) => p.status === 'open'),
    };
  }, [flatId, pollDate]);
  const { data, error, reload } = useResource(
    `groceries:${flatId}:${pollDate}`,
    fetcher,
  );
  useEffect(() => {
    if (!flatId) return;
    const channel = supabase
      .channel(`shopping:${flatId}:${pollDate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'grocery_checks' },
        () => {
          void reload();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_items' },
        () => {
          void reload();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [flatId, pollDate, reload]);
  async function toggleChecked(ingredientId: string, checked: boolean) {
    const line = data?.lines.find((l) => l.ingredientId === ingredientId);
    if (!line) return;
    // One database transaction updates every dish contributing to a merged item.
    checkResult(
      await supabase.rpc('set_grocery_checked', {
        p_sources: line.sources,
        p_checked: checked,
      }),
    );
    await reload();
  }
  return { data, error, reload, toggleChecked };
}
