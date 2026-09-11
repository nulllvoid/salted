import { useState } from 'react';

import { CollapsibleSection } from '@/components/collapsible-section';
import { MealEditor } from '@/components/meal-editor';
import { HouseholdSwitcher } from '@/components/settings/household-switcher';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Empty } from '@/components/ui';
import { useActiveGroup } from '@/contexts/active-group';
import { formatMealTime } from '@/lib/meal-schedule';

// Meal schedules for the active household.
//
// Almost no state of its own: MealEditor owns each meal's draft, validation,
// save and its own useAction, and calls reloadGroups() when it writes — so the
// meal list here re-renders from context without this page tracking anything
// beyond whether the "add" editor is open.
export function MealsPage() {
  const { activeGroup } = useActiveGroup();
  return <MealsPageContent key={activeGroup?.id ?? 'none'} />;
}
function MealsPageContent() {
  const { activeGroup } = useActiveGroup();
  const [addMeal, setAddMeal] = useState(false);

  const meals = activeGroup?.meals ?? [];

  return (
    <>
      <HouseholdSwitcher pageLabel="Preferences" />

      {!activeGroup ? (
        <Empty
          title="No household yet"
          detail="Create or join a household to set up its meals."
        />
      ) : (
        <Card>
          <ThemedText type="subtitle">{activeGroup.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Each meal runs on its own schedule. All times are IST.
          </ThemedText>

          {meals.map((meal) => (
            <CollapsibleSection
              key={meal.id}
              title={meal.name}
              summary={`Served ${formatMealTime(meal.serve_time)} · menu closes ${formatMealTime(meal.close_time)}`}
            >
              <MealEditor
                groupId={activeGroup.id}
                meal={meal}
                canRemove={meals.length > 1}
              />
            </CollapsibleSection>
          ))}

          <Button secondary onPress={() => setAddMeal(!addMeal)}>
            {addMeal ? 'Cancel new meal' : 'Add a meal'}
          </Button>
          {addMeal && (
            <MealEditor
              groupId={activeGroup.id}
              onDone={() => setAddMeal(false)}
            />
          )}
        </Card>
      )}
    </>
  );
}
