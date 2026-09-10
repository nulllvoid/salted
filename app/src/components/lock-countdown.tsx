import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { formatLockCountdown } from '@/lib/meal-schedule';

// The countdown is its own card so it reads as a live deadline rather than a
// caption on some other card's information.
//
// Isolated for a second reason too: it re-renders every second for the whole
// time the menu is open, and keeping that in one small component means the
// menu and dish list never repaint on its account.
export function LockCountdown({ closesAt }: { closesAt: number }) {
  const theme = useTheme();
  const now = useNow(1000);
  const { clock, closesAtLabel } = formatLockCountdown(closesAt, now);

  return (
    <Card>
      <View style={{ gap: 4 }}>
        <ThemedText type="smallBold" themeColor="accentText">
          MENU LOCKS IN
        </ThemedText>
        <ThemedText
          // Monospaced and tabular: proportional digits change width as they
          // roll, which visibly jitters a line that reflows every second.
          style={{
            fontFamily: Fonts.mono,
            fontVariant: ['tabular-nums'],
            fontSize: 40,
            lineHeight: 46,
            color: theme.text,
          }}
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
