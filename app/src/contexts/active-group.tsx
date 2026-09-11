import { createContext, useContext, useState, type ReactNode } from 'react';
import { useMyGroups, type GroupSummary } from '@/hooks/use-my-groups';
import { useSession } from '@/hooks/use-session';
import { addDays, istDate, nextMeal, type Meal } from '@/lib/meal-schedule';
interface ActiveGroupValue {
  groups: GroupSummary[] | undefined;
  error?: string;
  activeGroup: GroupSummary | null;
  activeMeal: Meal | null;
  pollDate: string;
  setActiveGroupId: (id: string) => void;
  setActiveMealId: (id: string) => void;
  setDayOffset: (offset: number) => void;
  reloadGroups: () => Promise<void>;
}
const ActiveGroupContext = createContext<ActiveGroupValue | null>(null);
export function ActiveGroupProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const { groups, error, reload } = useMyGroups(session);
  const [selection, setSelection] = useState<{
    group?: string;
    meal?: string;
    offset: number;
  }>({ offset: 0 });
  const activeGroup =
    groups?.find((g) => g.id === selection.group) ?? groups?.[0] ?? null;
  const explicitMeal = activeGroup?.meals.find((m) => m.id === selection.meal);
  const upcoming = nextMeal(activeGroup?.meals ?? []);
  const activeMeal = explicitMeal ?? upcoming?.meal ?? null;
  // Day follows the meal unless the user has picked one themselves. Defaulting
  // to today while nextMeal has rolled past the last serve time is what showed
  // a dispatched meal instead of the open poll for the next one; an explicit
  // meal or Today/Tomorrow tap still wins, via selection.offset.
  const dayOffset =
    selection.meal || selection.offset !== 0
      ? selection.offset
      : (upcoming?.dayOffset ?? 0);
  return (
    <ActiveGroupContext.Provider
      value={{
        groups,
        error,
        activeGroup,
        activeMeal,
        pollDate: addDays(istDate(), dayOffset),
        setActiveGroupId: (group) => setSelection({ group, offset: 0 }),
        setActiveMealId: (meal) => setSelection((s) => ({ ...s, meal })),
        setDayOffset: (offset) => setSelection((s) => ({ ...s, offset })),
        reloadGroups: reload,
      }}
    >
      {children}
    </ActiveGroupContext.Provider>
  );
}
export function useActiveGroup() {
  const value = useContext(ActiveGroupContext);
  if (!value) throw new Error('Missing household provider');
  return value;
}
