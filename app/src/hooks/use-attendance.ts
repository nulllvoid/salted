import { useCallback, useEffect } from 'react';
import { useActiveGroup } from '@/contexts/active-group';
import { supabase } from '@/lib/supabase';
import { checkResult } from '@/lib/errors';
import { useResource } from './use-resource';
export interface AttendanceMemberView {
  userId: string;
  displayName: string;
  dietSummary: string;
  isOut: boolean;
}
export function useAttendance(flatId: string | null | undefined) {
  const { activeMeal, pollDate } = useActiveGroup();
  const mealId = activeMeal?.id;
  const fetcher = useCallback(async (): Promise<
    AttendanceMemberView[] | null
  > => {
    if (!flatId || !mealId) return null;
    const [members, attendance] = await Promise.all([
      supabase
        .from('flat_members')
        .select(
          'user_id, profiles(display_name, diet_type, is_jain, allergies)',
        )
        .eq('flat_id', flatId)
        .throwOnError(),
      supabase
        .from('day_attendance')
        .select('user_id, is_out')
        .eq('flat_id', flatId)
        .eq('flat_meal_id', mealId)
        .eq('poll_date', pollDate)
        .throwOnError(),
    ]);
    const out = new Set(
      (attendance.data ?? []).filter((a) => a.is_out).map((a) => a.user_id),
    );
    return (members.data ?? []).flatMap((m) =>
      m.profiles
        ? [
            {
              userId: m.user_id,
              displayName: m.profiles.display_name,
              dietSummary: [
                m.profiles.diet_type === 'veg'
                  ? 'Vegetarian'
                  : m.profiles.diet_type === 'egg'
                    ? 'Vegetarian + eggs'
                    : 'Non-vegetarian',
                m.profiles.is_jain ? 'Jain' : '',
                m.profiles.allergies.length
                  ? `No ${m.profiles.allergies.join(', ')}`
                  : '',
              ]
                .filter(Boolean)
                .join(' · '),
              isOut: out.has(m.user_id),
            },
          ]
        : [],
    );
  }, [flatId, mealId, pollDate]);
  const {
    data: members,
    error,
    reload,
  } = useResource(`attendance:${flatId}:${mealId}:${pollDate}`, fetcher);
  useEffect(() => {
    if (!mealId) return;
    const channel = supabase
      .channel(`attendance:${mealId}:${pollDate}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'day_attendance',
          filter: `flat_meal_id=eq.${mealId}`,
        },
        () => {
          void reload();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [mealId, pollDate, reload]);
  async function setMemberOut(
    userId: string,
    isOut: boolean,
    actorId: string | undefined,
    pollId?: string,
  ) {
    if (!flatId || !mealId) return;
    checkResult(
      await supabase
        .from('day_attendance')
        .upsert({
          flat_id: flatId,
          flat_meal_id: mealId,
          user_id: userId,
          poll_date: pollDate,
          is_out: isOut,
        }),
    );
    if (actorId)
      await supabase
        .from('activity_log')
        .insert({
          flat_id: flatId,
          poll_id: pollId ?? null,
          actor_id: actorId,
          event_type: 'attendance_change',
          detail: { is_out: isOut },
        });
    await reload();
  }
  return { members, error, setMemberOut, reload };
}
