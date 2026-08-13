import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';
import type { ActivityEntry, CartLineView, DietType, RecipeKind, SuggestionView, TodayCartView } from '@/types/domain';

const DIET_RANK: Record<DietType, number> = { veg: 0, egg: 1, nonveg: 2 };

// Row shape for the activity_log select below — narrower than the generated
// Database['public']['Tables']['activity_log']['Row'] since detail's actual
// contents vary by event_type (see ActivityEntry in types/domain.ts).
interface ActivityLogRow {
  id: string;
  created_at: string;
  event_type: string;
  detail: Record<string, unknown>;
  profiles: { display_name: string } | null;
  recipes: { name: string } | null;
}

function toActivityEntry(row: ActivityLogRow): ActivityEntry | null {
  const actorDisplayName = row.profiles?.display_name ?? null;
  switch (row.event_type) {
    case 'cart_add':
      if (!row.recipes) return null;
      return { id: row.id, createdAt: row.created_at, actorDisplayName, eventType: 'cart_add', recipeName: row.recipes.name };
    case 'cart_remove':
      if (!row.recipes) return null;
      return { id: row.id, createdAt: row.created_at, actorDisplayName, eventType: 'cart_remove', recipeName: row.recipes.name };
    case 'cart_quantity_change':
      if (!row.recipes) return null;
      return {
        id: row.id,
        createdAt: row.created_at,
        actorDisplayName,
        eventType: 'cart_quantity_change',
        recipeName: row.recipes.name,
        fromQty: Number(row.detail.from_qty),
        toQty: Number(row.detail.to_qty),
      };
    case 'attendance_change':
      return {
        id: row.id,
        createdAt: row.created_at,
        actorDisplayName,
        eventType: 'attendance_change',
        isOut: Boolean(row.detail.is_out),
        reason: (row.detail.reason as string | null | undefined) ?? null,
      };
    default:
      return null;
  }
}

// Today's shared cart for one group, realtime-subscribed to cart_items so
// edits appear live across members (this is a shared, live-edited cart —
// not per-user votes; any member can edit any line). Callers pass the
// active group's id (see contexts/active-group.tsx).
export function useTodayCart(flatId: string | null | undefined, userId: string | undefined) {
  const [cart, setCart] = useState<TodayCartView | null | undefined>(undefined); // undefined = loading
  const [headcount, setHeadcount] = useState(0);

  const fetchHeadcount = useCallback(
    async (todayIst: string) => {
      if (!flatId) return 0;
      const [{ data: memberRows }, { data: attendanceRows }] = await Promise.all([
        supabase.from('flat_members').select('user_id').eq('flat_id', flatId),
        supabase
          .from('day_attendance')
          .select('user_id, is_out')
          .eq('flat_id', flatId)
          .eq('poll_date', todayIst),
      ]);
      const outUserIds = new Set((attendanceRows ?? []).filter((a) => a.is_out).map((a) => a.user_id));
      return Math.max((memberRows ?? []).length - outUserIds.size, 0);
    },
    [flatId]
  );

  const load = useCallback(async () => {
    if (!flatId || !userId) {
      setCart(null);
      return;
    }

    const todayIst = new Date(Date.now() + (5 * 60 + 30) * 60000).toISOString().slice(0, 10);

    const { data: pollRow } = await supabase
      .from('daily_polls')
      .select('id, poll_date, status, flat_meal_id')
      .eq('flat_id', flatId)
      .eq('poll_date', todayIst)
      .maybeSingle();

    if (!pollRow) {
      setCart(null);
      return;
    }

    const [
      { data: mainOptionRows },
      { data: accompanimentOptionRows },
      { data: cartRows },
      { data: memberRows },
      { data: attendanceRows },
      { data: activityRows },
      { data: flatRow },
    ] = await Promise.all([
      supabase
        .from('poll_options')
        .select('recipe_id, position, recipes(name, cuisine, diet_class, kind)')
        .eq('poll_id', pollRow.id)
        .order('position'),
      supabase
        .from('poll_accompaniment_options')
        .select('recipe_id, position, recipes(name, cuisine, diet_class, kind)')
        .eq('poll_id', pollRow.id)
        .order('position'),
      supabase
        .from('cart_items')
        .select('recipe_id, quantity, recipes(name, cuisine, diet_class, kind), profiles:updated_by(display_name)')
        .eq('poll_id', pollRow.id),
      supabase.from('flat_members').select('user_id').eq('flat_id', flatId),
      supabase
        .from('day_attendance')
        .select('user_id, is_out')
        .eq('flat_id', flatId)
        .eq('poll_date', todayIst),
      supabase
        .from('activity_log')
        .select('id, created_at, event_type, detail, profiles:actor_id(display_name), recipes(name)')
        .eq('poll_id', pollRow.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('flats').select('max_mains, max_accompaniments').eq('id', flatId).single(),
    ]);

    const outUserIds = new Set((attendanceRows ?? []).filter((a) => a.is_out).map((a) => a.user_id));
    const memberCount = (memberRows ?? []).length;
    setHeadcount(Math.max(memberCount - outUserIds.size, 0));

    const cartRecipeIds = new Set((cartRows ?? []).map((row) => row.recipe_id));

    const suggestions: SuggestionView[] = [...(mainOptionRows ?? []), ...(accompanimentOptionRows ?? [])]
      .filter((row) => row.recipes !== null)
      .map((row) => ({
        recipeId: row.recipe_id,
        name: row.recipes!.name,
        cuisine: row.recipes!.cuisine,
        dietClass: row.recipes!.diet_class as SuggestionView['dietClass'],
        kind: row.recipes!.kind as SuggestionView['kind'],
        inCart: cartRecipeIds.has(row.recipe_id),
      }));

    const cartLines: CartLineView[] = (cartRows ?? [])
      .filter((row) => row.recipes !== null)
      .map((row) => ({
        recipeId: row.recipe_id,
        name: row.recipes!.name,
        cuisine: row.recipes!.cuisine,
        dietClass: row.recipes!.diet_class as CartLineView['dietClass'],
        kind: row.recipes!.kind as CartLineView['kind'],
        quantity: row.quantity,
        updatedByDisplayName: row.profiles?.display_name ?? null,
      }));

    const activity: ActivityEntry[] = (activityRows ?? [])
      .map((row) => toActivityEntry(row as unknown as ActivityLogRow))
      .filter((entry): entry is ActivityEntry => entry !== null);

    setCart({
      pollId: pollRow.id,
      flatMealId: pollRow.flat_meal_id,
      pollDate: pollRow.poll_date,
      status: pollRow.status as TodayCartView['status'],
      headcount: Math.max(memberCount - outUserIds.size, 0),
      isOutToday: outUserIds.has(userId),
      suggestions,
      cartLines,
      activity,
      isLocked: pollRow.status !== 'open',
      maxMains: flatRow?.max_mains ?? null,
      maxAccompaniments: flatRow?.max_accompaniments ?? null,
    });
  }, [flatId, userId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => {
    if (!cart) return;

    // supabase.channel(topic) returns the SAME already-subscribed instance
    // if a channel with this topic is still registered client-side —
    // calling .on() on that reused instance throws "cannot add
    // postgres_changes callbacks ... after subscribe()". Removal
    // (removeChannel/unsubscribe) is genuinely async under the hood (it
    // waits on the socket to actually close before deregistering), so a
    // fast enough re-run of this effect (Fast Refresh, or cart flickering
    // null->object while flatId/userId re-resolve) can start before the
    // previous run's channel has finished tearing down. Explicitly await
    // removal of any stale channel for this exact topic before creating the
    // replacement, and bail out via `cancelled` if this effect was torn
    // down again in the meantime (StrictMode-style double-invoke, or the
    // pollId changing again mid-teardown).
    const pollId = cart.pollId;
    const topic = `cart:${pollId}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    async function setup() {
      const stale = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
      if (stale) await supabase.removeChannel(stale);
      if (cancelled) return;

      channel = supabase
        .channel(topic)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cart_items', filter: `poll_id=eq.${pollId}` },
          () => {
            load();
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'activity_log', filter: `poll_id=eq.${pollId}` },
          () => {
            load();
          }
        )
        // Poll status changes (close, dispatch) — without this, a client
        // that loaded the cart while it was still 'open' never learns it
        // locked until something else triggers a refetch.
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'daily_polls', filter: `id=eq.${pollId}` },
          () => {
            load();
          }
        )
        .subscribe();
    }

    void setup();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resubscribing on every `load` identity change would tear down/recreate the channel needlessly; cart.pollId is the only thing that should retrigger this.
  }, [cart?.pollId]);

  // Best-effort: a failed log insert should never block the cart mutation
  // it's describing, so errors are swallowed rather than surfaced to the
  // caller (the feed just misses an entry — no user-facing consequence).
  function logActivity(entry: {
    pollId: string;
    eventType: 'cart_add' | 'cart_remove' | 'cart_quantity_change' | 'attendance_change';
    recipeId?: string;
    detail?: Json;
  }) {
    if (!flatId || !userId) return;
    void supabase.from('activity_log').insert({
      flat_id: flatId,
      poll_id: entry.pollId,
      actor_id: userId,
      event_type: entry.eventType,
      recipe_id: entry.recipeId ?? null,
      detail: entry.detail ?? {},
    });
  }

  // First tap adds at qty=headcount (re-fetched fresh, not the possibly-stale
  // `headcount` state — a toggle of "I'm out" seconds ago must be reflected).
  // ignoreDuplicates guards the race where another member added the same
  // dish between this client's render and the tap — first-add wins.
  async function addToCart(recipeId: string) {
    if (!cart || !userId) return;
    const freshHeadcount = await fetchHeadcount(cart.pollDate);
    await supabase.from('cart_items').upsert(
      {
        poll_id: cart.pollId,
        recipe_id: recipeId,
        quantity: Math.max(freshHeadcount, 1),
        added_by: userId,
        updated_by: userId,
      },
      { onConflict: 'poll_id,recipe_id', ignoreDuplicates: true }
    );
    logActivity({ pollId: cart.pollId, eventType: 'cart_add', recipeId });
    await load();
  }

  // Cap re-fetched fresh each time (decision: a stale headcount cap would
  // let a quantity exceed the CURRENT headcount if someone toggled "I'm
  // out" in the few seconds since last load). Returns whether the
  // requested quantity got capped, so callers (the + stepper) can tell the
  // user why a tap did nothing rather than failing silently.
  async function setQuantity(recipeId: string, quantity: number): Promise<{ capped: boolean; headcount: number }> {
    if (!cart || !userId) return { capped: false, headcount: 0 };
    if (quantity <= 0) {
      await removeFromCart(recipeId);
      return { capped: false, headcount: 0 };
    }
    const freshHeadcount = await fetchHeadcount(cart.pollDate);
    const cap = Math.max(freshHeadcount, 1);
    const capped = Math.min(quantity, cap);
    const wasCapped = quantity > cap;
    const previousQty = cart.cartLines.find((line) => line.recipeId === recipeId)?.quantity;
    await supabase
      .from('cart_items')
      .update({ quantity: capped, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('poll_id', cart.pollId)
      .eq('recipe_id', recipeId);
    if (previousQty !== undefined && previousQty !== capped) {
      logActivity({
        pollId: cart.pollId,
        eventType: 'cart_quantity_change',
        recipeId,
        detail: { from_qty: previousQty, to_qty: capped },
      });
    }
    await load();
    return { capped: wasCapped, headcount: freshHeadcount };
  }

  async function removeFromCart(recipeId: string) {
    if (!cart) return;
    await supabase.from('cart_items').delete().eq('poll_id', cart.pollId).eq('recipe_id', recipeId);
    logActivity({ pollId: cart.pollId, eventType: 'cart_remove', recipeId });
    await load();
  }

  async function setOutToday(isOut: boolean, reason?: string) {
    if (!flatId || !userId || !cart) return;
    const todayIst = new Date(Date.now() + (5 * 60 + 30) * 60000).toISOString().slice(0, 10);
    // day_attendance keys on the meal as of the per-meal migration, so
    // being out for one meal no longer marks you out for the whole day.
    await supabase.from('day_attendance').upsert({
      flat_id: flatId,
      flat_meal_id: cart.flatMealId,
      user_id: userId,
      poll_date: todayIst,
      is_out: isOut,
    });
    if (cart) {
      logActivity({
        pollId: cart.pollId,
        eventType: 'attendance_change',
        detail: { is_out: isOut, reason: reason ?? null },
      });
    }
    await load();
  }

  // Client-side mirror of create_poll's isRecipeEligible dietary veto
  // (supabase/functions/create_poll/select-options.ts) — search must never
  // surface a dish the flat's union of diet/Jain/allergy constraints
  // forbids, same rule the daily suggestions already enforce server-side.
  // Unlike create_poll, search has no 10-day exclusion or variety heuristic
  // — those shape the day's curated picks, not an open-ended lookup.
  async function searchRecipes(kind: RecipeKind, query: string): Promise<SuggestionView[]> {
    if (!flatId || query.trim().length < 2) return [];

    const [{ data: memberRows }, { data: recipeRows }] = await Promise.all([
      supabase
        .from('flat_members')
        .select('profiles(diet_type, is_jain, allergies)')
        .eq('flat_id', flatId),
      supabase
        .from('recipes')
        .select('id, name, cuisine, diet_class, jain_ok, allergens, kind')
        .eq('kind', kind)
        .eq('is_active', true)
        .ilike('name', `%${query.trim()}%`)
        .limit(20),
    ]);

    const members = (memberRows ?? [])
      .filter((m) => m.profiles !== null)
      .map((m) => ({
        dietType: m.profiles!.diet_type as DietType,
        isJain: m.profiles!.is_jain,
        allergies: m.profiles!.allergies,
      }));
    if (members.length === 0) return [];

    const flatDietCeiling = Math.min(...members.map((m) => DIET_RANK[m.dietType] ?? DIET_RANK.nonveg));
    const anyJainMember = members.some((m) => m.isJain);
    const unionAllergies = new Set(members.flatMap((m) => m.allergies));

    const cartRecipeIds = new Set((cart?.cartLines ?? []).map((line) => line.recipeId));

    return (recipeRows ?? [])
      .filter((r) => (DIET_RANK[r.diet_class as DietType] ?? DIET_RANK.nonveg) <= flatDietCeiling)
      .filter((r) => !anyJainMember || r.jain_ok)
      .filter((r) => !r.allergens.some((a) => unionAllergies.has(a)))
      .map((r) => ({
        recipeId: r.id,
        name: r.name,
        cuisine: r.cuisine,
        dietClass: r.diet_class as SuggestionView['dietClass'],
        kind: r.kind as SuggestionView['kind'],
        inCart: cartRecipeIds.has(r.id),
      }));
  }

  // A single "safe for everyone" main + accompaniment for the empty-cart-
  // at-lock edge state (mockup: "the fallback, if nobody moves") — same
  // dietary veto as searchRecipes, but no query text; picks the first
  // eligible recipe per kind rather than a ranked list. Client-confirmed,
  // not server-auto-applied: close_poll only locks the cart, it never
  // writes a fallback itself, so this exists purely for the app to offer
  // one when the user opts in.
  async function getFallbackSuggestions(): Promise<{ main: SuggestionView | null; accompaniment: SuggestionView | null }> {
    if (!flatId) return { main: null, accompaniment: null };

    const [{ data: memberRows }, { data: mainRows }, { data: accompanimentRows }] = await Promise.all([
      supabase.from('flat_members').select('profiles(diet_type, is_jain, allergies)').eq('flat_id', flatId),
      supabase
        .from('recipes')
        .select('id, name, cuisine, diet_class, jain_ok, allergens, kind')
        .eq('kind', 'main')
        .eq('is_active', true)
        .order('name')
        .limit(50),
      supabase
        .from('recipes')
        .select('id, name, cuisine, diet_class, jain_ok, allergens, kind')
        .eq('kind', 'accompaniment')
        .eq('is_active', true)
        .order('name')
        .limit(50),
    ]);

    const members = (memberRows ?? [])
      .filter((m) => m.profiles !== null)
      .map((m) => ({
        dietType: m.profiles!.diet_type as DietType,
        isJain: m.profiles!.is_jain,
        allergies: m.profiles!.allergies,
      }));
    if (members.length === 0) return { main: null, accompaniment: null };

    const flatDietCeiling = Math.min(...members.map((m) => DIET_RANK[m.dietType] ?? DIET_RANK.nonveg));
    const anyJainMember = members.some((m) => m.isJain);
    const unionAllergies = new Set(members.flatMap((m) => m.allergies));

    function firstEligible(rows: typeof mainRows): SuggestionView | null {
      const eligible = (rows ?? [])
        .filter((r) => (DIET_RANK[r.diet_class as DietType] ?? DIET_RANK.nonveg) <= flatDietCeiling)
        .filter((r) => !anyJainMember || r.jain_ok)
        .filter((r) => !r.allergens.some((a) => unionAllergies.has(a)))[0];
      if (!eligible) return null;
      return {
        recipeId: eligible.id,
        name: eligible.name,
        cuisine: eligible.cuisine,
        dietClass: eligible.diet_class as SuggestionView['dietClass'],
        kind: eligible.kind as SuggestionView['kind'],
        inCart: false,
      };
    }

    return { main: firstEligible(mainRows), accompaniment: firstEligible(accompanimentRows) };
  }

  // addToCart can't be reused here: cart_items' RLS only allows writes
  // while the poll is 'open', which is precisely NOT the state this runs
  // in (the empty-cart-at-lock screen only shows once the poll is
  // 'closed'). take_fallback_cart_item is a security-definer RPC scoped to
  // exactly that one condition — see docs/05-schema.sql.
  async function takeFallback(recipeId: string) {
    if (!cart) return;
    const { error } = await supabase.rpc('take_fallback_cart_item', {
      p_poll_id: cart.pollId,
      p_recipe_id: recipeId,
      p_quantity: Math.max(headcount, 1),
    });
    if (!error) {
      logActivity({ pollId: cart.pollId, eventType: 'cart_add', recipeId, detail: { fallback: true } });
      await load();
    }
    return { error };
  }

  return {
    cart,
    headcount,
    addToCart,
    setQuantity,
    removeFromCart,
    setOutToday,
    searchRecipes,
    getFallbackSuggestions,
    takeFallback,
    reload: load,
  };
}
