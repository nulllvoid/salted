import { createContext, useContext, useState, type ReactNode } from 'react';
import { useMyGroups, type GroupSummary } from '@/hooks/use-my-groups';
import { useSession } from '@/hooks/use-session';
import { addDays, istDate, type Meal } from '@/lib/meal-schedule';
import { resolveMealSelection } from '@/lib/meal-selection';
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
    offset?: number;
  }>({});
  const activeGroup =
    groups?.find((g) => g.id === selection.group) ?? groups?.[0] ?? null;
  const { meal: activeMeal, offset: dayOffset } = resolveMealSelection(
    activeGroup?.meals ?? [],
    selection,
  );
  return (
    <ActiveGroupContext.Provider
      value={{
        groups,
        error,
        activeGroup,
        activeMeal,
        pollDate: addDays(istDate(), dayOffset),
        setActiveGroupId: (group) => setSelection({ group }),
        setActiveMealId: (meal) =>
          setSelection((s) => ({ ...s, meal, offset: dayOffset })),
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
