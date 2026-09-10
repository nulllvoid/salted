import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// A tap-to-expand section used to keep secondary detail (poll times, cook
// info, activity history) out of view until asked for — defaults closed so
// screens read as scannable summaries first, full detail second.
export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.header}
        onPress={() => setOpen((o) => !o)}
        hitSlop={8}
      >
        <ThemedView style={styles.headerText}>
          <ThemedText type="smallBold">{title}</ThemedText>
          {!open && summary ? (
            <ThemedText type="small" themeColor="textSecondary">
              {summary}
            </ThemedText>
          ) : null}
        </ThemedView>
        <ThemedText
          type="smallBold"
          themeColor="textSecondary"
          style={[
            styles.chevron,
            open && styles.chevronOpen,
            { color: theme.accent },
          ]}
        >
          ⌄
        </ThemedText>
      </Pressable>

      {open && <ThemedView style={styles.body}>{children}</ThemedView>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  chevron: {
    fontSize: 20,
    lineHeight: 20,
    transform: [{ rotate: '-90deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '0deg' }],
  },
  body: {
    gap: Spacing.two,
  },
});
