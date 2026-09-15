import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { InteractivePressable as Pressable } from './interactive-pressable';
import { Layout, Radius, Spacing } from '@/constants/theme';
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
  initialPageKey,
}: {
  pages: PagerPage[];
  a11yLabel: string;
  initialPageKey?: string;
}) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      pages.findIndex((page) => page.key === initialPageKey),
    ),
  );

  function onLayout(event: LayoutChangeEvent) {
    // Measure the pager's own box rather than the window: the tab navigator
    // insets content, and each page caps its inner content at ui.screen's
    // maxWidth. Only a real measurement keeps the snap interval equal to the
    // page width at both 420px and desktop widths.
    const next = event.nativeEvent.layout.width;
    if (next !== width) {
      // Resizing can clamp the old offset before the new pages are laid out.
      // Those synthetic scroll events must not change the selected section.
      animatingToTap.current = true;
      if (tapSettleTimer.current) clearTimeout(tapSettleTimer.current);
      tapSettleTimer.current = setTimeout(endTapAnimation, 600);
    }
    setWidth((current) => (current === next ? current : next));
  }

  // True while a tap-driven scrollTo animation is travelling. See onScroll.
  const animatingToTap = useRef(false);
  const tapSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function endTapAnimation() {
    animatingToTap.current = false;
    if (tapSettleTimer.current) {
      clearTimeout(tapSettleTimer.current);
      tapSettleTimer.current = null;
    }
  }

  function onSettled(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (
      animatingToTap.current ||
      Math.abs(event.nativeEvent.layoutMeasurement.width - width) > 1
    )
      return;
    // A drag or fling ending means the user is driving, so hand tracking back
    // even if a tap animation was still notionally in flight.
    endTapAnimation();
    setActive(
      pageIndexFromOffset(
        event.nativeEvent.contentOffset.x,
        width,
        pages.length,
      ),
    );
  }

  // Track the offset DURING the gesture, not only when it ends.
  //
  // The end-of-gesture handlers below are not enough on their own: a wheel or
  // trackpad swipe on RN-web fires neither momentum-end nor drag-end reliably,
  // so the header indicator stayed on the old page while the content had
  // clearly moved. scrollEventThrottle was already set for this and did
  // nothing without an onScroll to throttle. feature-slides.tsx tracks the
  // same way, which is why its dots follow a swipe and these tabs did not.
  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    // Ignore the offsets a tap's own animation travels through. goTo sets the
    // destination immediately, then animates there — and that animation
    // reports every intermediate offset, starting next to the page being left.
    // Following those made a tap visibly snap back to the old tab and walk
    // forward again, once per page crossed.
    if (
      animatingToTap.current ||
      Math.abs(event.nativeEvent.layoutMeasurement.width - width) > 1
    )
      return;
    const next = pageIndexFromOffset(
      event.nativeEvent.contentOffset.x,
      width,
      pages.length,
    );
    setActive((current) => (current === next ? current : next));
  }

  function goTo(index: number) {
    setActive(index);
    animatingToTap.current = true;
    // The timeout is the primary release on web, not a fallback:
    // onMomentumScrollEnd does not reliably fire for a programmatic scrollTo
    // there — the same gap that kept the header from following a swipe before
    // onScroll existed. Comfortably longer than the animation, short enough
    // that tracking is live again well before a considered second tap.
    if (tapSettleTimer.current) clearTimeout(tapSettleTimer.current);
    tapSettleTimer.current = setTimeout(endTapAnimation, 600);
    scrollRef.current?.scrollTo({
      x: offsetForIndex(index, width),
      animated: true,
    });
  }

  // A pending timer must not fire into an unmounted component, and a settings
  // tab is easy to leave mid-animation.
  useEffect(() => endTapAnimation, []);

  useEffect(() => {
    // A resize or rotation changes the snap interval, which would otherwise
    // leave the pager parked between two pages. Re-pin to the active page.
    if (width) {
      scrollRef.current?.scrollTo({
        x: offsetForIndex(active, width),
        animated: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-pin on resize only; including `active` would fight the user's own swipe
  }, [width]);

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {/* A segmented control, not free-width pills.
          Measured at a 360px viewport: the four labels need 365px of tab
          before gaps against 320px of available track, so as pills they
          always wrapped and stranded the last one on a row of its own.
          Equal flex shares divide whatever track there is — four segments of
          ~80px at 360px — which fits by construction at any width rather
          than by luck with a particular set of labels.

          It is also the third use of this shape in the app, after the
          household strip and DaySwitch, so it reads as the established "pick
          one of these" control rather than a new idiom. */}
      <View
        style={{
          paddingHorizontal: Layout.gutter,
          paddingTop: Spacing.inline,
          width: '100%',
          // Mirrors ui.screen, which each page applies to its own content:
          // without it the control sits flush left on a wide screen while the
          // content it switches between is centred.
          maxWidth: Layout.maxWidth,
          alignSelf: 'center',
        }}
      >
        <View
          accessibilityRole="tablist"
          accessibilityLabel={a11yLabel}
          style={{
            flexDirection: 'row',
            borderRadius: Radius.pill,
            borderWidth: 1,
            borderColor: theme.divider,
            backgroundColor: theme.backgroundElement,
            // The track owns the rounding, so the selected segment's fill is
            // clipped to it instead of squaring off the end corners.
            overflow: 'hidden',
          }}
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
                style={{
                  // Equal shares of the track. minWidth: 0 lets a long label
                  // shrink its own segment rather than force the row wider
                  // than the screen.
                  flex: 1,
                  minWidth: 0,
                  minHeight: Layout.touchTarget,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: Spacing.micro,
                  paddingVertical: Spacing.inline,
                  backgroundColor: selected ? theme.accentText : 'transparent',
                }}
              >
                <ThemedText
                  type="smallBold"
                  // Allow enlarged text to wrap instead of hiding destinations.
                  style={{
                    color: selected ? theme.background : theme.text,
                    textAlign: 'center',
                  }}
                >
                  {page.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
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
          onScroll={onScroll}
          onScrollBeginDrag={endTapAnimation}
          onMomentumScrollEnd={onSettled}
          onScrollEndDrag={onSettled}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {pages.map((page, index) => (
            <View
              key={page.key}
              accessibilityElementsHidden={active !== index}
              importantForAccessibility={
                active === index ? 'auto' : 'no-hide-descendants'
              }
              aria-hidden={active !== index}
              {...(Platform.OS === 'web' ? { inert: active !== index } : {})}
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
