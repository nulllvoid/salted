import { useState } from 'react';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

// Inset focus rings stay visible inside clipped segmented-control tracks.
export function InteractivePressable({
  style,
  onFocus,
  onBlur,
  onHoverIn,
  onHoverOut,
  disabled,
  ...props
}: PressableProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      {...props}
      disabled={disabled}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onHoverIn={(event) => {
        setHovered(true);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        onHoverOut?.(event);
      }}
      style={(state) => {
        const baseStyle = typeof style === 'function' ? style(state) : style;
        const filled =
          StyleSheet.flatten(baseStyle)?.backgroundColor === theme.accentText;
        return [
          baseStyle,
          {
            opacity: disabled ? 0.5 : state.pressed ? 0.72 : hovered ? 0.88 : 1,
          },
          focused &&
            !disabled && {
              outlineStyle: 'solid',
              outlineColor: filled ? theme.background : theme.accentText,
              outlineWidth: 2,
              outlineOffset: -3,
            },
        ];
      }}
    />
  );
}
