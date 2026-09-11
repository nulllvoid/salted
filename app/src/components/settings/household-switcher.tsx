import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useActiveGroup } from '@/contexts/active-group';

// Household picker for the household-scoped Settings pages.
//
// Styled as the same browser-tab strip the Today header uses: the selected
// household is a sliver of surface joined to the content below by the
// baseline rule, the rest recede to plain labels. It replaced a green
// accent2Soft callout with a heavy left border, which shouted louder than
// anything it contained — on a page whose whole job is the content beneath it.
//
// pageLabel is not decoration: all pager pages stay mounted at once, so
// several copies of this strip exist in the DOM simultaneously and the group
// names alone cannot tell them apart. Labelling the wrapper lets a test — or a
// screen reader — say which page's switcher it means.
//
// accessibilityRole stays "button", NOT "tab": settings.spec.ts and
// scripts/verify-intro-settings.mjs locate these with
// getByRole('button', { name: <household name> }).
export function HouseholdSwitcher({ pageLabel }: { pageLabel: string }) {
  const { groups, activeGroup, setActiveGroupId } = useActiveGroup();
  const theme = useTheme();
  if (!activeGroup) return null;

  // One household is not a choice. Keep the context line — it still says which
  // household is being edited — but drop the strip entirely.
  const showTabs = (groups?.length ?? 0) > 1;

  return (
    <View accessibilityLabel={`Household for ${pageLabel}`} style={{ gap: 8 }}>
      {showTabs && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            borderBottomWidth: 1,
            borderBottomColor: theme.divider,
          }}
        >
          {groups?.map((group) => {
            const selected = group.id === activeGroup.id;
            return (
              <Pressable
                key={group.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                aria-selected={selected}
                onPress={() => setActiveGroupId(group.id)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 36,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  backgroundColor: selected
                    ? theme.backgroundElement
                    : 'transparent',
                  borderWidth: 1,
                  borderBottomWidth: 0,
                  borderColor: selected ? theme.divider : 'transparent',
                  marginBottom: -1,
                }}
              >
                <ThemedText
                  type="small"
                  numberOfLines={1}
                  style={{
                    color: selected ? theme.text : theme.textSecondary,
                    fontWeight: selected ? '700' : '400',
                    textAlign: 'center',
                  }}
                >
                  {group.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        Editing {activeGroup.name}. Changes apply only to this household.
      </ThemedText>
    </View>
  );
}
