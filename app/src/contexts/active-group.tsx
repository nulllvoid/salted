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
  const activeMeal =
    activeGroup?.meals.find((m) => m.id === selection.meal) ??
    nextMeal(activeGroup?.meals ?? []);
  return (
    <ActiveGroupContext.Provider
      value={{
        groups,
        error,
        activeGroup,
        activeMeal,
        pollDate: addDays(istDate(), selection.offset),
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
