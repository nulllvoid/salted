import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useActiveGroup } from '@/contexts/active-group';

// Household switcher for the Today screen, styled as a browser tab strip.
//
// This is the least-used control on the screen — most people belong to one
// household and never touch it — so it had no business being the heaviest
// thing in the header. As pills it used the same solid accent fill as the
// Today/Tomorrow and meal choices, three rows of maximum-contrast brown
// stacked on a cream ground, all competing for the same attention.
//
// A tab strip inverts that. The selected tab is the page's own background
// colour sitting on a baseline rule, so it reads as attached to the content
// below rather than floating on top of it; the rest recede into the ground
// with only a label. Nothing here is filled with accent, so the eye goes to
// the meal title and the day chips instead.
//
// accessibilityRole stays "button", NOT "tab": the e2e suite and
// scripts/verify-intro-settings.mjs locate these with
// getByRole('button', { name: <household name> }). The look changed; the
// accessibility contract did not.
export function HouseholdTabs() {
  const { groups, activeGroup, setActiveGroupId } = useActiveGroup();
  const theme = useTheme();

  // One household is not a choice — render nothing rather than a single
  // permanently-selected tab.
  if (!groups || groups.length < 2) return null;

  return (
    <View
      accessibilityLabel="Household"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        // The baseline the tabs sit on. The selected tab covers its own slice
        // of this rule, which is what makes it read as joined to the content.
        borderBottomWidth: 1,
        borderBottomColor: theme.divider,
        marginBottom: 4,
      }}
    >
      {groups.map((group) => {
        const selected = group.id === activeGroup?.id;
        return (
          <Pressable
            key={group.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => setActiveGroupId(group.id)}
            style={{
              minHeight: 36,
              justifyContent: 'center',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              // Only the selected tab is drawn: a sliver of surface lifted out
              // of the strip. Unselected tabs are label-only, no fill, no
              // border — they should barely register until looked for.
              backgroundColor: selected ? theme.backgroundElement : 'transparent',
              borderWidth: 1,
              borderBottomWidth: 0,
              borderColor: selected ? theme.divider : 'transparent',
              // Pull the selected tab down over the strip's baseline rule so
              // the two meet with no seam.
              marginBottom: -1,
            }}
          >
            <ThemedText
              type="small"
              style={{
                color: selected ? theme.text : theme.textSecondary,
                fontWeight: selected ? '700' : '400',
              }}
            >
              {group.name}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}
