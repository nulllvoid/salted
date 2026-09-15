import { View } from 'react-native';
import { useActiveGroup } from '@/contexts/active-group';
import { HouseholdChoices } from './household-choices';
import { ThemedText } from './themed-text';
import { ui } from './ui';

export function HouseholdTabs() {
  const { groups, activeGroup, setActiveGroupId } = useActiveGroup();
  if (!groups || groups.length < 2) return null;
  return (
    <View style={ui.heading} accessibilityLabel="Household">
      <ThemedText type="small" themeColor="textSecondary">
        Household · {activeGroup?.name}
      </ThemedText>
      <HouseholdChoices
        groups={groups}
        activeId={activeGroup?.id}
        onSelect={setActiveGroupId}
      />
    </View>
  );
}
