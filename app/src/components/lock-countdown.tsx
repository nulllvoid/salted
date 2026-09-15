import { Spacing } from '@/constants/theme';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { useNow } from '@/hooks/use-now';
import { formatLockCountdown } from '@/lib/meal-schedule';

// The countdown is its own card so it reads as a live deadline rather than a
// caption on some other card's information.
//
// Isolated for a second reason too: it re-renders every second for the whole
// time the menu is open, and keeping that in one small component means the
// menu and dish list never repaint on its account.
export function LockCountdown({ closesAt }: { closesAt: number }) {
  const now = useNow(1000);
  const { clock, closesAtLabel } = formatLockCountdown(closesAt, now);

  return (
    <Card>
      <View style={{ gap: Spacing.micro }}>
        <ThemedText type="eyebrow" themeColor="accentText">
          MENU LOCKS IN
        </ThemedText>
        <ThemedText
          type="countdown"
          accessibilityLabel={`Menu locks in ${clock}, closes ${closesAtLabel}`}
        >
          {clock}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Closes {closesAtLabel}
        </ThemedText>
      </View>
    </Card>
  );
}
