import { useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { checkResult } from '@/lib/errors';
import type { Meal } from '@/lib/meal-schedule';
import { useResource } from './use-resource';
export interface GroupSummary {
  id: string;
  name: string;
  meals: Meal[];
}
export function useMyGroups(session: Session | null | undefined) {
  const userId = session?.user.id;
  const fetcher = useCallback(async (): Promise<GroupSummary[]> => {
    if (!userId) return [];
    const { data } = checkResult(
      await supabase
        .from('flat_members')
        .select(
          'flat_id, flats(id, name, flat_meals!flat_meals_flat_id_fkey(*))',
        )
        .eq('user_id', userId),
    );
    return (data ?? [])
      .flatMap((row) =>
        row.flats
          ? [
              {
                id: row.flats.id,
                name: row.flats.name,
                meals: row.flats.flat_meals
                  .filter((m) => m.is_active)
                  .sort((a, b) => a.position - b.position),
              },
            ]
          : [],
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [userId]);
  const { data, error, reload } = useResource(`groups:${userId}`, fetcher);
  return { groups: session === undefined ? undefined : data, error, reload };
}
