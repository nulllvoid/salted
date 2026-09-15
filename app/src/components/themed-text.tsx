import { StyleSheet, Text, type TextProps } from 'react-native';
import { Fonts, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Each family identifies a loaded face; never synthesize bold on the regular face.
export const typography = StyleSheet.create({
  default: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 24 },
  bodyBold: { fontFamily: Fonts.bodyBold, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  smallBold: { fontFamily: Fonts.bodyBold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18 },
  eyebrow: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: Fonts.heading,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.2,
  },
  itemTitle: { fontFamily: Fonts.bodyBold, fontSize: 18, lineHeight: 24 },
  hero: {
    fontFamily: Fonts.heading,
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: -0.3,
  },
  brand: {
    fontFamily: Fonts.heading,
    fontSize: 48,
    lineHeight: 56,
    letterSpacing: -0.5,
  },
  brandSmall: {
    fontFamily: Fonts.heading,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.2,
  },
  link: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: 'underline',
  },
  linkPrimary: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: 'underline',
  },
  code: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 18 },
  countdown: {
    fontFamily: Fonts.mono,
    fontSize: 40,
    lineHeight: 48,
    fontVariant: ['tabular-nums'],
  },
});

export type ThemedTextProps = TextProps & {
  type?: keyof typeof typography;
  themeColor?: ThemeColor;
};

export function ThemedText({
  style,
  type = 'default',
  themeColor,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();
  return (
    <Text
      style={[
        {
          color:
            theme[
              themeColor ?? (type === 'linkPrimary' ? 'accentText' : 'text')
            ],
        },
        typography[type],
        style,
      ]}
      {...rest}
    />
  );
}
