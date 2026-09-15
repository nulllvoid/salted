/**
 * Design tokens for the Organic design system (see the "Faltmeal app UI
 * redesign" folder's design-system readme and styles.css for the source of
 * truth). Light values are taken directly from styles.css; dark values are
 * a same-relationship inversion (surface lighter than bg, accent
 * brightened for contrast) since the mockups only specify a light theme.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#201e1d',
    background: '#f5ead8',
    backgroundElement: '#ebddc5', // --color-surface
    backgroundSelected: '#dcd3c4', // --color-neutral-300
    textSecondary: '#645c50', // --color-neutral-700
    accent: '#c67139',
    accentSoft: '#fff2eb', // --color-accent-100, tinted fills
    accentText: '#8c491a', // --color-accent-700, body-size text in accent
    accentPressed: '#b2622d', // --color-accent-600
    accent2: '#7a8a5e',
    accent2Soft: '#f0fae1', // --color-accent-2-100
    accent2Text: '#56633f', // --color-accent-2-700
    divider: 'rgba(32,30,29,0.16)',
    danger: '#b3392c', // not in Organic's palette (readme defines no error role) — a warm red kept in the same OKLCH-ish family as the terracotta accent rather than a cool/clashing red
    dangerSoft: '#fbe4de',
  },
  dark: {
    text: '#f9f4ed',
    background: '#201e1d',
    backgroundElement: '#2e2b25',
    backgroundSelected: '#474238',
    textSecondary: '#c0b6a5',
    accent: '#f6a06b', // --color-accent-400, brightened for contrast on dark
    accentSoft: '#402310', // --color-accent-900, tinted fills
    accentText: '#ffc6a5', // --color-accent-300
    accentPressed: '#ffc6a5', // --color-accent-300 (one step past base, lighter on dark)
    accent2: '#aebf92', // --color-accent-2-400
    accent2Soft: '#272e1b', // --color-accent-2-900
    accent2Text: '#ccdbb2', // --color-accent-2-300
    divider: 'rgba(249,244,237,0.16)',
    danger: '#e08672',
    dangerSoft: '#3d241d',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
    heading: 'Caprasimo_400Regular',
    body: 'Figtree_400Regular',
    bodyBold: 'Figtree_700Bold',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
    heading: 'Caprasimo_400Regular',
    body: 'Figtree_400Regular',
    bodyBold: 'Figtree_700Bold',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
    heading: 'Caprasimo_400Regular',
    body: 'Figtree_400Regular',
    bodyBold: 'Figtree_700Bold',
  },
});

// Mobile adaptation of Organic. Relationships use a mobile spacing scale;
// see docs/mobile-design-system.md for the component roles.
export const Spacing = {
  micro: 4,
  label: 8,
  inline: 12,
  field: 16,
  section: 24,
  spacious: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 16,
  lg: 28,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 680;
export const Layout = {
  gutter: 20,
  maxWidth: MaxContentWidth,
  touchTarget: 44,
  controlHeight: 48,
  readingWidth: 430,
} as const;
