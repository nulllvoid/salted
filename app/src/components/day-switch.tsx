import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

// Today / Tomorrow, as one segmented control rather than two pills.
//
// The day is a property of the selected meal — "Breakfast, tomorrow" is a
// single answer — so it should not look like a third peer choice alongside
// the household tabs and the meal chips. Two solid accent pills made it the
// loudest control on a screen where it is rarely changed: a poll can open the
// day before it is served, so the day matters, but most visits accept the
// default.
//
// One bordered track holding two halves reads as a single control, and the
// selected half is a soft tinted fill rather than the solid accent used by
// the meal chips beside it. That keeps the meal — the thing people actually
// switch — as the brighter of the two.
export function DaySwitch({
  tomorrow,
  onChange,
}: {
  tomorrow: boolean;
  onChange: (offset: number) => void;
}) {
  const theme = useTheme();

  return (
    <View
      accessibilityLabel="Day"
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: theme.divider,
        borderRadius: 999,
        // Clip the segment fills to the track's pill shape so the selected
        // half's corners follow the outer radius instead of squaring off.
        overflow: 'hidden',
      }}
    >
      {[
        { label: 'Today', offset: 0, selected: !tomorrow },
        { label: 'Tomorrow', offset: 1, selected: tomorrow },
      ].map(({ label, offset, selected }) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          aria-selected={selected}
          onPress={() => onChange(offset)}
          style={{
            minHeight: 36,
            justifyContent: 'center',
            paddingHorizontal: 14,
            paddingVertical: 7,
            backgroundColor: selected ? theme.accentSoft : 'transparent',
          }}
        >
          <ThemedText
            type="small"
            style={{
              color: selected ? theme.accentText : theme.textSecondary,
              fontWeight: selected ? '700' : '400',
            }}
          >
            {label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}
