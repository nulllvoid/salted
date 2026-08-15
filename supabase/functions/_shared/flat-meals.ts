import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// One row per meal a flat serves (part 1's flat_meals table). This replaced
// flats.poll_open_time/poll_close_time/dispatch_time as the pipeline's unit of
// scheduling — a flat with breakfast and dinner has two rows and gets two
// independent polls a day.
export interface FlatMealRow {
  id: string;
  flat_id: string;
  name: string;
  basis: string;
  serve_time: string;
  open_offset_min: number;
  close_time: string;
  dispatch_offset_min: number;
}

// Every active meal across every flat. The functions run on a dumb 15-minute
// pg_cron heartbeat and self-select what is due, so this is deliberately
// unfiltered — the due-check is wall-clock arithmetic in TypeScript
// (see ist-time.ts), not a SQL predicate.
export async function fetchActiveFlatMeals(admin: SupabaseClient): Promise<FlatMealRow[]> {
  const { data, error } = await admin
    .from('flat_meals')
    .select('id, flat_id, name, basis, serve_time, close_time, open_offset_min, dispatch_offset_min')
    .eq('is_active', true)
    .order('flat_id', { ascending: true })
    .order('position', { ascending: true });

  if (error) throw error;
  return (data ?? []) as FlatMealRow[];
}
