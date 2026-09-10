import { useCallback, useEffect } from 'react';
import { useActiveGroup } from '@/contexts/active-group';
import { supabase } from '@/lib/supabase';
import { useResource } from './use-resource';
export interface CookDispatchView {
  cookName: string;
  cookPhone: string;
  status: 'queued' | 'mocked' | 'sent' | 'delivered' | 'failed';
  payloadEn: string;
  payloadTranslated: string;
}
export function useCookDispatch(flatId: string | null | undefined) {
  const { activeMeal, pollDate } = useActiveGroup();
  const mealId = activeMeal?.id;
  const fetcher = useCallback(async (): Promise<CookDispatchView | null> => {
    if (!flatId || !mealId) return null;
    const [poll, cook] = await Promise.all([
      supabase
        .from('daily_polls')
        .select('id, status')
        .eq('flat_id', flatId)
        .eq('flat_meal_id', mealId)
        .eq('poll_date', pollDate)
        .maybeSingle()
        .throwOnError(),
      supabase
        .from('cooks')
        .select('name, phone')
        .eq('flat_id', flatId)
        .eq('is_active', true)
        .maybeSingle()
        .throwOnError(),
    ]);
    if (!poll.data || !cook.data || poll.data.status === 'cancelled')
      return null;
    const { data: log } = await supabase
      .from('dispatch_log')
      .select('status, payload_en, payload_translated')
      .eq('poll_id', poll.data.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .throwOnError();
    return {
      cookName: cook.data.name,
      cookPhone: cook.data.phone,
      status: (log?.status ?? 'queued') as CookDispatchView['status'],
      payloadEn: log?.payload_en ?? '',
      payloadTranslated: log?.payload_translated ?? '',
    };
  }, [flatId, mealId, pollDate]);
  const {
    data: dispatch,
    error,
    reload,
  } = useResource(`dispatch:${flatId}:${mealId}:${pollDate}`, fetcher);
  useEffect(() => {
    if (!flatId) return;
    const channel = supabase
      .channel(`cook-preview:${flatId}:${mealId}:${pollDate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dispatch_log' },
        () => {
          void reload();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [flatId, mealId, pollDate, reload]);
  return { dispatch, error, reload };
}
