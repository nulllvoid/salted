import { View } from 'react-native';

import { Pager, type PagerPage } from '@/components/pager';
import { CookPage } from '@/components/settings/cook-page';
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
const PAGES: PagerPage[] = [
  { key: 'profile', label: 'Profile', render: () => <ProfilePage /> },
  { key: 'meals', label: 'Meals', render: () => <MealsPage /> },
  { key: 'cook', label: 'Cook', render: () => <CookPage /> },
  { key: 'household', label: 'Household', render: () => <HouseholdPage /> },
  { key: 'about', label: 'About', render: () => <AboutPage /> },
];

export default function SettingsScreen() {
  return (
    <Screen scroll={false}>
      {/* Padding and width are explicit here: with scroll={false} the Screen no
          longer applies ui.screen, whose padding now belongs to each page's own
          scroller inside the pager. Match ui.screen's maxWidth and centring too,
          or on a wide screen this header sits flush left while the pages'
          content is centred — two columns that look unrelated. */}
      <View
        style={{
          gap: 8,
          paddingHorizontal: 20,
          paddingTop: 20,
          width: '100%',
          maxWidth: 680,
          alignSelf: 'center',
        }}
      >
        <ThemedText type="smallBold" themeColor="accentText">
          MAKE YOURSELF AT HOME
        </ThemedText>
        <ThemedText type="title">Settings</ThemedText>
        <ThemedText themeColor="textSecondary">
          A few details for meals that work for everyone.
        </ThemedText>
      </View>
      <Pager pages={PAGES} a11yLabel="Settings sections" />
    </Screen>
  );
}
