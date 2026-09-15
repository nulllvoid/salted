import { View } from 'react-native';
import { useActiveGroup } from '@/contexts/active-group';
import { HouseholdChoices } from '@/components/household-choices';
import { ThemedText } from '@/components/themed-text';
import { ui } from '@/components/ui';

export function HouseholdSwitcher({ pageLabel }: { pageLabel: string }) {
  const { groups, activeGroup, setActiveGroupId } = useActiveGroup();
  if (!activeGroup) return null;
  return (
    <View accessibilityLabel={`Household for ${pageLabel}`} style={ui.heading}>
      <ThemedText type="small" themeColor="textSecondary">
        Editing {activeGroup.name}. Changes apply only to this household.
      </ThemedText>
      {(groups?.length ?? 0) > 1 && (
        <HouseholdChoices
          groups={groups ?? []}
          activeId={activeGroup.id}
          onSelect={setActiveGroupId}
        />
      )}
    </View>
  );
}
