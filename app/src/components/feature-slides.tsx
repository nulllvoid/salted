import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';

const SLIDES = [
  {
    title: 'One table.\nEveryone’s taste.',
    detail: 'Pick meals together, with everyone’s food preferences in mind.',
    label: 'Plan meals together',
  },
  {
    title: 'One list.\nLess running around.',
    detail:
      'Your shared menu becomes a grocery list. Check things off as you shop.',
    label: 'Share a grocery list',
  },
  {
    title: 'A clear plan.\nA happier cook.',
    detail:
      'Send your cook the menu and portions on WhatsApp. No extra app needed.',
    label: 'Keep your cook in the loop',
  },
];

function FeatureArt({ index }: { index: number }) {
  const theme = useTheme();
  const ink = theme.accentText;
  return (
    <Svg width="100%" height={220} viewBox="0 0 300 220">
      <Circle cx={150} cy={110} r={98} fill={theme.backgroundElement} />
      {index === 0 ? (
        <>
          <Circle
            cx={150}
            cy={116}
            r={67}
            fill={theme.background}
            stroke={ink}
            strokeWidth={3}
          />
          <Circle
            cx={150}
            cy={116}
            r={49}
            stroke={ink}
            strokeWidth={1.5}
            fill="none"
            opacity={0.3}
          />
          <Path
            d="M121 122 Q140 74 173 96 Q185 126 154 145 Q127 151 121 122Z"
            fill={theme.accent}
          />
          <Path
            d="M141 108 Q156 104 163 120 M134 123 L143 133"
            fill="none"
            stroke={theme.background}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <Path
            d="M60 75 V105 Q68 117 76 105 V75 M68 75 V157 M231 75 Q215 100 231 118 V157"
            fill="none"
            stroke={ink}
            strokeWidth={4}
            strokeLinecap="round"
          />
          <Circle cx={209} cy={49} r={21} fill={theme.accent2Soft} />
          <Path
            d="M199 49 L206 56 L219 42"
            fill="none"
            stroke={theme.accent2Text}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </>
      ) : index === 1 ? (
        <>
          <Rect
            x={87}
            y={35}
            width={129}
            height={157}
            rx={17}
            fill={theme.background}
            stroke={ink}
            strokeWidth={3}
          />
          <Rect
            x={122}
            y={25}
            width={59}
            height={21}
            rx={8}
            fill={theme.accent}
          />
          {[77, 116, 155].map((y, i) => (
            <Path
              key={y}
              d={`M106 ${y} L112 ${y + 5} L121 ${y - 6} M138 ${y} H190`}
              fill="none"
              stroke={i < 2 ? theme.accent2Text : ink}
              strokeWidth={3}
              strokeLinecap="round"
            />
          ))}
        </>
      ) : (
        <>
          <Rect
            x={100}
            y={22}
            width={103}
            height={178}
            rx={19}
            fill={theme.background}
            stroke={ink}
            strokeWidth={3}
          />
          <Path
            d="M134 35 H169 M139 187 H164"
            stroke={ink}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <Path
            d="M77 65 H197 Q211 65 211 79 V124 Q211 138 197 138 H103 L83 155 V138 H77 Q63 138 63 124 V79 Q63 65 77 65Z"
            fill={theme.accent2Soft}
            stroke={theme.accent2Text}
            strokeWidth={2}
          />
          <Path
            d="M90 92 H182 M90 108 H161 M90 122 H142"
            stroke={theme.accent2Text}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <Circle cx={224} cy={158} r={24} fill={theme.accent} />
          <Path
            d="M214 158 L221 165 L235 151"
            fill="none"
            stroke={theme.background}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </>
      )}
    </Svg>
  );
}

export function FeatureSlides({
  onDone,
  reviewing = false,
}: {
  onDone: () => void;
  reviewing?: boolean;
}) {
  const theme = useTheme();
  const [active, setActive] = useState(0);
  const [width, setWidth] = useState(0);
  const pager = useRef<ScrollView>(null);
  const position = useRef(0);
  useEffect(() => {
    pager.current?.scrollTo({ x: position.current * width, animated: false });
  }, [width]);
  function goTo(index: number) {
    position.current = index;
    setActive(index);
    pager.current?.scrollTo({ x: index * width, animated: true });
  }
  return (
    <Screen scroll={false}>
      <View style={styles.frame}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={{ fontSize: 27 }}>
            Salted
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={onDone}
            style={styles.skip}
          >
            <ThemedText themeColor="textSecondary">
              {reviewing ? 'Close' : 'Skip'}
            </ThemedText>
          </Pressable>
        </View>
        <View
          style={{ flex: 1 }}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        >
          {width > 0 && (
            <ScrollView
              ref={pager}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(event) => {
                const next = Math.max(
                  0,
                  Math.min(
                    2,
                    Math.round(event.nativeEvent.contentOffset.x / width),
                  ),
                );
                position.current = next;
                setActive(next);
              }}
            >
              {SLIDES.map((slide, index) => (
                <ScrollView
                  key={slide.label}
                  style={{ width }}
                  contentContainerStyle={styles.page}
                  accessibilityElementsHidden={active !== index}
                  importantForAccessibility={
                    active === index ? 'auto' : 'no-hide-descendants'
                  }
                  aria-hidden={active !== index}
                >
                  <View style={styles.copy}>
                    <FeatureArt index={index} />
                    <ThemedText type="title" style={styles.title}>
                      {slide.title}
                    </ThemedText>
                    <ThemedText
                      themeColor="textSecondary"
                      style={styles.description}
                    >
                      {slide.detail}
                    </ThemedText>
                  </View>
                </ScrollView>
              ))}
            </ScrollView>
          )}
        </View>
        <View style={styles.footer}>
          <View
            style={styles.dots}
            accessibilityRole="tablist"
            accessibilityLabel="About Salted"
          >
            {SLIDES.map((slide, index) => (
              <Pressable
                key={slide.label}
                accessibilityRole="tab"
                accessibilityLabel={`${index + 1} of 3: ${slide.label}`}
                accessibilityState={{ selected: active === index }}
                aria-selected={active === index}
                onPress={() => goTo(index)}
                style={styles.dotTarget}
              >
                <View
                  style={{
                    height: 7,
                    width: active === index ? 24 : 7,
                    borderRadius: 4,
                    backgroundColor:
                      active === index ? theme.accentText : theme.divider,
                  }}
                />
              </Pressable>
            ))}
          </View>
          <Button onPress={() => (active === 2 ? onDone() : goTo(active + 1))}>
            {active === 2 ? (reviewing ? 'Done' : 'Get started') : 'Next'}
          </Button>
        </View>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  frame: { flex: 1, width: '100%', maxWidth: 680, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  skip: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  page: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  copy: { width: '100%', maxWidth: 430, alignSelf: 'center', gap: 20 },
  title: { fontSize: 34, lineHeight: 41, textAlign: 'center' },
  description: { textAlign: 'center', lineHeight: 25 },
  footer: { paddingHorizontal: 24, paddingBottom: 16, gap: 10 },
  dots: { flexDirection: 'row', justifyContent: 'center' },
  dotTarget: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
