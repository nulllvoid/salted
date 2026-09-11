import { View } from 'react-native';

import { Chip, ui } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useActiveGroup } from '@/contexts/active-group';

// Household picker for the household-scoped Settings pages (Meals, Cook,
// Household). Profile is user-scoped and does not show it.
//
// Lifted from (tabs)/index.tsx's switcher so both tabs share one idiom,
// including the "only when there is a choice to make" threshold.
//
// pageLabel is not decoration: all four pager pages stay mounted at once, so
// three copies of these chips exist in the DOM simultaneously and the group
// names alone cannot tell them apart. Labelling the wrapper lets a test — or a
// screen reader — say which page's switcher it means.
export function HouseholdSwitcher({ pageLabel }: { pageLabel: string }) {
  const { groups, activeGroup, setActiveGroupId } = useActiveGroup();
  const theme = useTheme();
  if (!activeGroup) return null;

  return (
    <View
      accessibilityLabel={`Household for ${pageLabel}`}
      style={{
        gap: 12,
        padding: 16,
        borderRadius: 16,
        backgroundColor: theme.accent2Soft,
        borderLeftWidth: 4,
        borderLeftColor: theme.accent2Text,
      }}
    >
      <ThemedText type="smallBold" themeColor="accent2Text">
        HOUSEHOLD · {pageLabel.toUpperCase()}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Editing {activeGroup.name}. Changes apply only to this household.
      </ThemedText>
      <View style={ui.wrap}>
        {groups?.map((group) => (
          <Chip
            key={group.id}
            selected={group.id === activeGroup?.id}
            onPress={() => setActiveGroupId(group.id)}
          >
            {group.name}
          </Chip>
        ))}
      </View>
    </View>
  );
}
