import { useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { InteractivePressable as Pressable } from './interactive-pressable';
import { Icon } from './icon';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Layout, Spacing } from '@/constants/theme';

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
        <Icon name={open ? 'chevronDown' : 'chevronRight'} />
      </Pressable>

      {open && <ThemedView style={styles.body}>{children}</ThemedView>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.label,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.label,
    minHeight: Layout.touchTarget,
    paddingVertical: Spacing.label,
  },
  headerText: {
    flex: 1,
    gap: Spacing.micro,
  },
  body: {
    gap: Spacing.field,
  },
});
