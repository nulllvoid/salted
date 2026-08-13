import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { DietType } from '@/types/domain';

export interface AttendanceMemberView {
  userId: string;
  displayName: string;
  dietSummary: string; // "veg · no peanut" style, from profiles
  isOut: boolean;
}

function todayIst(): string {
  return new Date(Date.now() + (5 * 60 + 30) * 60000).toISOString().slice(0, 10);
}

function dietSummary(dietType: DietType, isJain: boolean, allergies: string[]): string {
  const parts = [isJain ? `${dietType} · Jain` : dietType];
  if (allergies.length > 0) parts.push(`no ${allergies.join(', ')}`);
  return parts.join(' · ');
}

// "Who's eating" for the current flat/day — every flat_members row joined
// against today's day_attendance (absence of a row means "in", per
// day_attendance's `is_out boolean not null default false` semantics
// applied at the query layer, not a stored default row per member).
// Any flatmate can set any other member's attendance here — day_attendance's
// write policies were widened from self-only to any flat member
// (supabase/migrations/20260109000001_sides_limits_activity.sql) precisely
// to support this screen.
export function useAttendance(flatId: string | null | undefined) {
  const [members, setMembers] = useState<AttendanceMemberView[] | null | undefined>(undefined); // undefined = loading

  const load = useCallback(async () => {
    if (!flatId) {
      setMembers(null);
      return;
    }

    const [{ data: memberRows }, { data: attendanceRows }] = await Promise.all([
      supabase
        .from('flat_members')
        .select('user_id, profiles(display_name, diet_type, is_jain, allergies)')
        .eq('flat_id', flatId),
      supabase.from('day_attendance').select('user_id, is_out').eq('flat_id', flatId).eq('poll_date', todayIst()),
    ]);

    const outUserIds = new Set((attendanceRows ?? []).filter((a) => a.is_out).map((a) => a.user_id));

    setMembers(
      (memberRows ?? [])
        .filter((m) => m.profiles !== null)
        .map((m) => ({
          userId: m.user_id,
          displayName: m.profiles!.display_name,
          dietSummary: dietSummary(
            m.profiles!.diet_type as DietType,
            m.profiles!.is_jain,
            m.profiles!.allergies
          ),
          isOut: outUserIds.has(m.user_id),
        }))
    );
  }, [flatId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // pollId threads the log entry into that day's cart activity feed
  // (use-today-cart.ts's realtime subscription filters on poll_id) — pass
  // the current day's poll id when called from a cart-adjacent screen.
  async function setMemberOut(userId: string, isOut: boolean, actorId: string | undefined, pollId?: string) {
    if (!flatId) return;
    // day_attendance keys on the meal as of the per-meal migration. This
    // hook has no poll loaded, so it resolves the flat's first meal — which
    // matches today's one-meal-per-flat reality; part 3 threads the
    // selected meal through instead.
    const { data: meal } = await supabase
      .from('flat_meals')
      .select('id')
      .eq('flat_id', flatId)
      .eq('is_active', true)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!meal) return;
    await supabase.from('day_attendance').upsert({
      flat_id: flatId,
      flat_meal_id: meal.id,
      user_id: userId,
      poll_date: todayIst(),
      is_out: isOut,
    });
    if (actorId) {
      await supabase.from('activity_log').insert({
        flat_id: flatId,
        poll_id: pollId ?? null,
        actor_id: actorId,
        event_type: 'attendance_change',
        detail: { is_out: isOut, reason: null },
      });
    }
    await load();
  }

  return { members, setMemberOut, reload: load };
}
