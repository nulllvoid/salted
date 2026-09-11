import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { useActiveGroup } from '@/contexts/active-group';
import { useSession } from '@/hooks/use-session';

const InkPath = Animated.createAnimatedComponent(Path);
const Grain = Animated.createAnimatedComponent(Circle);
const INK = '#8c491a';
const CYCLE = 3200;

// Hand-drawn monoline lettering. Each letter traces along its own pen path;
// no font download or rectangular text wipe is needed for the launch mark.
const LETTERS = [
  {
    d: 'M69 25 C61 8 28 16 28 34 C28 50 67 42 64 62 C61 85 24 87 18 69 C15 60 24 55 32 58',
    length: 200,
  },
  {
    d: 'M107 49 C91 35 76 56 80 70 C84 84 99 75 105 55 L109 46 L102 70 C99 84 114 75 122 65',
    length: 133,
  },
  {
    d: 'M121 64 C139 47 151 12 141 12 C128 12 118 64 126 75 C132 82 144 72 150 64',
    length: 132,
  },
  { d: 'M168 25 L153 66 C147 86 165 77 176 64 M147 43 L180 40', length: 104 },
  {
    d: 'M177 63 C205 57 204 41 191 46 C176 51 171 73 184 78 C194 81 204 72 212 63',
    length: 102,
  },
  {
    d: 'M239 49 C225 35 207 57 212 72 C218 89 236 68 240 53 L253 14 C248 30 237 62 239 73 C241 84 257 74 269 61',
    length: 182,
  },
];

function Steam({
  x,
  phase,
  clock,
  still,
}: {
  x: number;
  phase: number;
  clock: SharedValue<number>;
  still: boolean;
}) {
  const props = useAnimatedProps(() => {
    const wave = still ? 0 : Math.sin(clock.value * Math.PI * 4 + phase) * 10;
    return {
      d: `M${x} 154 C${x - 17 + wave} 138 ${x + 18 - wave} 126 ${x + wave} 110 C${x - 16 + wave} 93 ${x + 13 - wave} 83 ${x + wave / 2} 69`,
      opacity: still
        ? 0.5
        : 0.4 + 0.22 * Math.sin(clock.value * Math.PI * 2 + phase),
    };
  });
  return (
    <InkPath
      animatedProps={props}
      fill="none"
      stroke={INK}
      strokeWidth={5}
      strokeLinecap="round"
    />
  );
}

function Salt({
  index,
  clock,
  still,
}: {
  index: number;
  clock: SharedValue<number>;
  still: boolean;
}) {
  const props = useAnimatedProps(() => {
    const t = (clock.value * 3 + index / 9) % 1;
    return {
      cx: 223 - 37 * t + Math.sin(index * 8) * t * 20,
      cy: 86 + t * t * 90,
      opacity: still ? 0 : Math.sin(t * Math.PI) * 0.95,
    };
  });
  return (
    <Grain animatedProps={props} r={index % 3 === 0 ? 2.7 : 1.8} fill={INK} />
  );
}

function Letter({
  index,
  clock,
  still,
}: {
  index: number;
  clock: SharedValue<number>;
  still: boolean;
}) {
  const letter = LETTERS[index];
  const props = useAnimatedProps(() => {
    const progress = still
      ? 1
      : Math.max(0, Math.min(1, (clock.value - 0.05 - index * 0.095) / 0.15));
    return {
      strokeDashoffset: letter.length * (1 - progress),
      opacity: still ? 1 : clock.value > 0.89 ? (1 - clock.value) / 0.11 : 1,
    };
  });
  return (
    <InkPath
      d={letter.d}
      animatedProps={props}
      strokeDasharray={[letter.length, letter.length]}
      strokeWidth={4.7}
      stroke={INK}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

export function AnimatedLaunch({ fontsReady }: { fontsReady: boolean }) {
  const session = useSession();
  const { groups, error } = useActiveGroup();
  const still = useReducedMotion();
  const clock = useSharedValue(0);
  const fade = useSharedValue(1);
  const [cycleSeen, setCycleSeen] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const ready =
    fontsReady &&
    session !== undefined &&
    (!session || groups !== undefined || !!error);

  useEffect(() => {
    if (!still)
      clock.value = withRepeat(
        withTiming(1, { duration: CYCLE, easing: Easing.linear }),
        -1,
        false,
      );
    const firstCycle = setTimeout(() => setCycleSeen(true), still ? 200 : 2700);
    // A slow backend must never strand someone behind the brand animation.
    const deadline = setTimeout(() => setTimedOut(true), 7000);
    return () => {
      cancelAnimation(clock);
      clearTimeout(firstCycle);
      clearTimeout(deadline);
    };
  }, [clock, still]);

  useEffect(() => {
    if (!(cycleSeen && ready) && !timedOut) return;
    fade.value = withTiming(0, { duration: still ? 0 : 300 });
    const timer = setTimeout(() => setDismissed(true), still ? 0 : 300);
    return () => clearTimeout(timer);
  }, [cycleSeen, ready, timedOut, still, fade]);
  useEffect(() => {
    if (dismissed) cancelAnimation(clock);
  }, [dismissed, clock]);
  const opacity = useAnimatedStyle(() => ({ opacity: fade.value }));
  const shaker = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${still ? 208 : 208 + Math.sin(clock.value * Math.PI * 12) * 9}deg`,
      },
      { translateY: still ? 0 : Math.sin(clock.value * Math.PI * 12) * 2 },
    ],
  }));

  if (dismissed) return null;
  return (
    <Animated.View
      testID="animated-launch"
      accessibilityRole="progressbar"
      accessibilityLabel="Salted is getting your table ready"
      style={[StyleSheet.absoluteFill, styles.screen, opacity]}
      onLayout={() => {
        void SplashScreen.hideAsync().catch(() => {});
      }}
    >
      <View
        style={styles.art}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Svg width={300} height={265} viewBox="0 0 300 265">
          <Ellipse cx={150} cy={238} rx={62} ry={5} fill={INK} opacity={0.07} />
          {[108, 147, 181].map((x, i) => (
            <Steam key={x} x={x} phase={i * 1.8} clock={clock} still={still} />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <Salt key={i} index={i} clock={clock} still={still} />
          ))}
          <Path
            d="M67 174 H233 C224 213 194 232 150 232 C106 232 76 213 67 174Z"
            fill="#c67139"
            stroke={INK}
            strokeWidth={6}
            strokeLinejoin="round"
          />
          <Path
            d="M76 178 H224"
            stroke="#e8a270"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <Path
            d="M119 241 H181"
            stroke={INK}
            strokeWidth={6}
            strokeLinecap="round"
          />
        </Svg>
        <Animated.View style={[styles.shaker, shaker]}>
          <Svg width={44} height={66} viewBox="0 0 44 66">
            <Path
              d="M12 9 Q22 3 32 9 L35 18 H9Z"
              fill="#ebddc5"
              stroke={INK}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
            <Path
              d="M9 18 H35 L32 52 Q22 58 12 52Z"
              fill="#f5ead8"
              stroke={INK}
              strokeWidth={2.5}
            />
            <Path d="M13 40 H31 L30 50 Q22 54 14 50Z" fill="#ebddc5" />
            <Circle cx={17} cy={12} r={1.4} fill={INK} />
            <Circle cx={26} cy={12} r={1.4} fill={INK} />
          </Svg>
        </Animated.View>
        <Svg width={300} height={106} viewBox="0 0 290 100">
          {LETTERS.map((_, index) => (
            <Letter key={index} index={index} clock={clock} still={still} />
          ))}
        </Svg>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#f5ead8',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  art: { width: 300, marginTop: -45 },
  shaker: { position: 'absolute', left: 217, top: 18 },
});
