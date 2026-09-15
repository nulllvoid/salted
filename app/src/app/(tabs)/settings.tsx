import { TextGroup } from '@/components/text-group';
import { Layout, Spacing } from '@/constants/theme';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Pager, type PagerPage } from '@/components/pager';
import { HouseholdPage } from '@/components/settings/household-page';
import { MealsPage } from '@/components/settings/meals-page';
import { ProfilePage } from '@/components/settings/profile-page';
import { AboutPage } from '@/components/settings/about-page';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui';

// Settings is a shell: a fixed header over four swipeable pages.
//
// One route, four components — not four routes. A horizontal pager needs every
// page mounted side by side, which router screens (one at a time) cannot do,
// and nesting a navigator here would change the URL surface that
// (tabs)/index.tsx's router.push('/(tabs)/settings') depends on.
//
// The merged error banner that used to sit here is gone. It conflated three
// unrelated sources behind a single "Try again" that fired two reloads; each
// page now surfaces its own failure next to the control that caused it.
// The group-level error is not re-handled here either — (tabs)/_layout.tsx
// already gates the whole tab on it, so this screen never mounts in that state.
// Four tabs, not five: Cook was a whole tab to reach one card about one
// person, so it moved into Household alongside the members and invite code it
// belongs with.
//
// Labels are deliberately short. The segmented control gives each tab an
// equal quarter of the track — 80px at a 360px viewport — and "Preferences"
// and "Household" both ellipsised at that width. A truncated tab hides where
// it leads, which is the one thing a tab has to say, so the words give way
// rather than the layout: "Meals" is also the more literal name for a page of
// meal schedules, and "Home" for the household itself.
const PAGES: PagerPage[] = [
  { key: 'profile', label: 'Profile', render: () => <ProfilePage /> },
  { key: 'meals', label: 'Meals', render: () => <MealsPage /> },
  { key: 'household', label: 'Home', render: () => <HouseholdPage /> },
  { key: 'about', label: 'About', render: () => <AboutPage /> },
];

export default function SettingsScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const initialPageKey = PAGES.some((page) => page.key === section)
    ? section
    : 'profile';
  return (
    <Screen scroll={false}>
      {/* Padding and width are explicit here: with scroll={false} the Screen no
          longer applies ui.screen, whose padding now belongs to each page's own
          scroller inside the pager. Match ui.screen's maxWidth and centring too,
          or on a wide screen this header sits flush left while the pages'
          content is centred — two columns that look unrelated. */}
      <View
        style={{
          gap: Spacing.label,
          paddingHorizontal: Layout.gutter,
          paddingTop: Layout.gutter,
          width: '100%',
          maxWidth: Layout.maxWidth,
          alignSelf: 'center',
        }}
      >
        <TextGroup>
          <ThemedText type="eyebrow" themeColor="accentText">
            MAKE YOURSELF AT HOME
          </ThemedText>
          <ThemedText type="title">Settings</ThemedText>
          <ThemedText themeColor="textSecondary">
            A few details for meals that work for everyone.
          </ThemedText>
        </TextGroup>
      </View>
      <Pager
        key={initialPageKey}
        initialPageKey={initialPageKey}
        pages={PAGES}
        a11yLabel="Settings sections"
      />
    </Screen>
  );
}
