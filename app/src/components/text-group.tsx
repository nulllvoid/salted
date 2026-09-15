import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Spacing } from '@/constants/theme';

// A heading and its supporting copy form one group, separated from fields or
// the next section by the surrounding screen/card's larger spacing.
export function TextGroup({ children }: { children: ReactNode }) {
  return <View style={{ gap: Spacing.label }}>{children}</View>;
}
