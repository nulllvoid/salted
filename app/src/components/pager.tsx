import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Loading, ui } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { offsetForIndex, pageIndexFromOffset } from '@/lib/pager';

export interface PagerPage {
  key: string;
  label: string;
  render: () => ReactNode;
}

// A horizontal, page-snapping ScrollView with a tappable segmented header.
//
// Deliberately built on ScrollView rather than a pager library: none is
// installed (no react-native-pager-view, no react-native-tab-view, and
// expo-router 57 dropped @react-navigation entirely), and the e2e suite drives
// the web build in a browser where swipe gestures are mouse-drag at best. The
// header is therefore the primary, always-tappable affordance and the swipe is
// an enhancement — not the other way round.
export function Pager({
  pages,
  a11yLabel,
}: {
  pages: PagerPage[];
  a11yLabel: string;
}) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(0);

  function onLayout(event: LayoutChangeEvent) {
    // Measure the pager's own box rather than the window: the tab navigator
    // insets content, and each page caps its inner content at ui.screen's
    // maxWidth. Only a real measurement keeps the snap interval equal to the
    // page width at both 420px and desktop widths.
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (current === next ? current : next));
  }

  function onSettled(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setActive(pageIndexFromOffset(event.nativeEvent.contentOffset.x, width, pages.length));
  }

  function goTo(index: number) {
    setActive(index);
    scrollRef.current?.scrollTo({ x: offsetForIndex(index, width), animated: true });
  }

  useEffect(() => {
    // A resize or rotation changes the snap interval, which would otherwise
    // leave the pager parked between two pages. Re-pin to the active page.
    if (width) {
      scrollRef.current?.scrollTo({ x: offsetForIndex(active, width), animated: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-pin on resize only; including `active` would fight the user's own swipe
  }, [width]);

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={a11yLabel}
        // maxWidth/alignSelf mirror ui.screen, which each page applies to its
        // own content: without them the tabs sit flush left on a wide screen
        // while the content they switch between is centred.
        style={[
          ui.wrap,
          {
            paddingHorizontal: 20,
            paddingTop: 12,
            width: '100%',
            maxWidth: 680,
            alignSelf: 'center',
          },
        ]}
      >
        {pages.map((page, index) => {
          const selected = index === active;
          return (
            <Pressable
              key={page.key}
              // Not the Chip component: it hardcodes accessibilityRole="button",
              // which would make these indistinguishable from the household and
              // diet chips elsewhere on the same screen.
              accessibilityRole="tab"
              accessibilityLabel={page.label}
              accessibilityState={{ selected }}
              // RN-web does not map accessibilityState.selected to
              // aria-selected on a Pressable (verified: the attribute comes
              // back null), so set it directly. Native reads
              // accessibilityState; the web build needs this for screen
              // readers and for tests to tell which section is open.
              aria-selected={selected}
              onPress={() => goTo(index)}
              style={[
                ui.chip,
                {
                  backgroundColor: selected ? theme.accentText : theme.backgroundElement,
                  borderColor: selected ? theme.accentText : theme.divider,
                },
              ]}
            >
              <ThemedText
                type="smallBold"
                style={{ color: selected ? theme.background : theme.text }}
              >
                {page.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {width === 0 ? (
        <Loading />
      ) : (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Both handlers: momentum fires on native flings, end-drag is what
          // fires on a web mouse drag.
          onMomentumScrollEnd={onSettled}
          onScrollEndDrag={onSettled}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {pages.map((page) => (
            <View
              key={page.key}
              // No accessibilityRole here: React Native's AccessibilityRole
              // union has no "tabpanel" (unlike "tab"/"tablist" above). The
              // label alone still maps to aria-label on RN-web, which is what
              // scopes assertions to one page — all four stay mounted, so
              // text from an off-screen page is otherwise matchable.
              accessibilityLabel={page.label}
              // height: '100%' is load-bearing, not cosmetic. A ScrollView only
              // scrolls inside a bounded height, and that bound has to be
              // transferred down every parent. With width alone this View sized
              // itself to its content (Profile measured 842px against a 536px
              // pager), so the inner scroller had nothing to overflow and the
              // horizontal pager absorbed the overflow instead.
              style={{ width, height: '100%' }}
            >
              {/* Each page owns its vertical scrolling and carries ui.screen's
                  padding and max-width, which must stay inside the page rather
                  than on the pager. */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={{ flex: 1 }}
                contentContainerStyle={ui.screen}
              >
                {page.render()}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
