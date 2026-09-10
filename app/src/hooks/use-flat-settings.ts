import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useResource } from './use-resource';
import type { Tables, TablesUpdate } from '@/types/database';
export interface FlatSettingsData {
  flat: Tables<'flats'>;
  members: { userId: string; displayName: string; role: string }[];
  cook: Tables<'cooks'> | null;
}
export function useFlatSettings(flatId: string | null | undefined) {
  const fetcher = useCallback(async (): Promise<FlatSettingsData | null> => {
    if (!flatId) return null;
    const [flat, members, cook] = await Promise.all([
      supabase
        .from('flats')
        .select('*')
        .eq('id', flatId)
        .single()
        .throwOnError(),
      supabase
        .from('flat_members')
        .select('user_id, role, profiles(display_name)')
        .eq('flat_id', flatId)
        .throwOnError(),
      supabase
        .from('cooks')
        .select('*')
        .eq('flat_id', flatId)
        .eq('is_active', true)
        .maybeSingle()
        .throwOnError(),
    ]);
    if (!flat.data) return null;
    return {
      flat: flat.data,
      members: (members.data ?? []).map((m) => ({
        userId: m.user_id,
        displayName: m.profiles?.display_name ?? 'Member',
        role: m.role,
      })),
      cook: cook.data,
    };
  }, [flatId]);
  const { data, error, reload } = useResource(`settings:${flatId}`, fetcher);
  async function updateFlat(patch: TablesUpdate<'flats'>) {
    if (!flatId) throw new Error('No household selected');
    await supabase
      .from('flats')
      .update(patch)
      .eq('id', flatId)
      .select('id')
      .single()
      .throwOnError();
    await reload();
    return { error: null };
  }
  async function upsertCook(patch: {
    name: string;
    phone: string;
    language: string;
  }) {
    if (!flatId) throw new Error('No household selected');
    if (!/^\+[1-9]\d{7,14}$/.test(patch.phone) || !patch.name.trim())
      throw new Error('Enter a name and international phone number');
    const existing = data?.cook;
    if (existing)
      await supabase
        .from('cooks')
        .update(patch)
        .eq('id', existing.id)
        .select('id')
        .single()
        .throwOnError();
    else
      await supabase
        .from('cooks')
        .insert({ flat_id: flatId, ...patch })
        .throwOnError();
    await reload();
    return { error: null };
  }
  async function leaveFlat(userId: string) {
    if (!flatId) throw new Error('No household selected');
    await supabase
      .from('flat_members')
      .delete()
      .eq('flat_id', flatId)
      .eq('user_id', userId)
      .throwOnError();
    return { error: null };
  }
  return { data, error, updateFlat, upsertCook, leaveFlat, reload };
}
