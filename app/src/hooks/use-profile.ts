import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { TablesUpdate } from '@/types/database';
import { useResource } from './use-resource';
export function useProfile(userId: string | undefined) {
  const fetcher = useCallback(async () => {
    if (!userId) return null;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .throwOnError();
    return data;
  }, [userId]);
  const {
    data: profile,
    error,
    reload,
  } = useResource(`profile:${userId}`, fetcher);
  async function updateProfile(patch: TablesUpdate<'profiles'>) {
    if (!userId) throw new Error('Sign in first');
    await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('id')
      .single()
      .throwOnError();
    await reload();
    return { error: null };
  }
  return { profile, error, updateProfile, reload };
}
