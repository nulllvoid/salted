import { useEffect, useRef } from 'react';
import { ScrollView } from 'react-native';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { InteractivePressable } from './interactive-pressable';
import { ThemedText } from './themed-text';

// Content-sized tabs preserve names instead of squeezing every household into
// equal fractions. Long names wrap within a tab; the strip scrolls horizontally.
export function HouseholdChoices({
  groups,
  activeId,
  onSelect,
}: {
  groups: readonly { id: string; name: string }[];
  activeId?: string;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  const scroll = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  useEffect(() => {
    if (activeId && positions.current[activeId] !== undefined) {
      scroll.current?.scrollTo({
        x: positions.current[activeId],
        animated: false,
      });
    }
  }, [activeId]);
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator
      contentContainerStyle={{
        gap: Spacing.micro,
        alignItems: 'stretch',
        paddingBottom: Spacing.label,
      }}
    >
      {groups.map((group) => {
        const selected = group.id === activeId;
        return (
          <InteractivePressable
            key={group.id}
            accessibilityRole="button"
            accessibilityLabel={group.name}
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => onSelect(group.id)}
            onLayout={(event) => {
              const x = event.nativeEvent.layout.x;
              positions.current[group.id] = x;
              if (selected) scroll.current?.scrollTo({ x, animated: false });
            }}
            style={{
              minHeight: Layout.touchTarget,
              maxWidth: 220,
              paddingHorizontal: Spacing.inline,
              paddingVertical: Spacing.label,
              justifyContent: 'center',
              borderRadius: Radius.sm,
              borderBottomWidth: 2,
              borderBottomColor: selected ? theme.accentText : theme.divider,
              backgroundColor: selected
                ? theme.backgroundElement
                : 'transparent',
            }}
          >
            <ThemedText
              type={selected ? 'smallBold' : 'small'}
              themeColor={selected ? 'text' : 'textSecondary'}
            >
              {group.name}
            </ThemedText>
          </InteractivePressable>
        );
      })}
    </ScrollView>
  );
}
