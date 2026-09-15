import { TextGroup } from '@/components/text-group';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Switch as NativeSwitch,
  type SwitchProps,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fonts, Layout, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { InteractivePressable as Pressable } from './interactive-pressable';
import { Icon, type IconName } from './icon';

export function Screen({
  children,
  footer,
  scroll = true,
  nativeHeader = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  // Opt out of the vertical ScrollView for screens that manage their own
  // scrolling — a horizontal pager needs a bounded-height parent, and pages
  // inside it carry their own scrollers. Defaults true so every existing
  // caller is unaffected.
  scroll?: boolean;
  nativeHeader?: boolean;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={nativeHeader ? ['bottom'] : ['top', 'bottom']}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={ui.screen}
          >
            {children}
          </ScrollView>
        ) : (
          // Deliberately no ui.screen here: its padding and maxWidth/centring
          // belong to each page inside the pager. Applying them out here would
          // make the pager narrower than its own snap interval, so paging
          // would land between pages on wide screens.
          <View style={{ flex: 1 }}>{children}</View>
        )}
        {footer && (
          <View
            style={[
              ui.footer,
              {
                backgroundColor: theme.background,
                borderTopColor: theme.divider,
              },
            ]}
          >
            {footer}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Card({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        ui.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.divider,
        },
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  children,
  onPress,
  disabled,
  busy,
  secondary,
  label,
  textOnly,
  icon,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
  label?: string;
  textOnly?: boolean;
  icon?: IconName;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[
        ui.button,
        textOnly && ui.textButton,
        {
          backgroundColor:
            secondary || textOnly ? 'transparent' : theme.accentText,
          borderColor: textOnly
            ? 'transparent'
            : secondary
              ? theme.divider
              : theme.accentText,
        },
      ]}
    >
      {busy && (
        <ActivityIndicator
          color={secondary || textOnly ? theme.accentText : theme.background}
        />
      )}
      {icon && (
        <Icon
          name={icon}
          color={secondary || textOnly ? theme.accentText : theme.background}
        />
      )}
      {children != null && (
        <ThemedText
          type="smallBold"
          style={{
            color: textOnly
              ? theme.accentText
              : secondary
                ? theme.text
                : theme.background,
            textAlign: 'center',
            flexShrink: 1,
          }}
        >
          {children}
        </ThemedText>
      )}
    </Pressable>
  );
}
export function IconButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={ui.iconButton}
    >
      <Icon name={icon} />
    </Pressable>
  );
}

export function Field({
  label,
  accessory,
  hint,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & { label: string; accessory?: ReactNode; hint?: string }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: Spacing.label }}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View
        style={[
          ui.inputFrame,
          {
            backgroundColor: theme.background,
            borderColor: focused ? theme.accentText : theme.divider,
          },
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={theme.textSecondary}
          {...props}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            ui.input,
            {
              color: theme.text,
              textAlignVertical: props.multiline ? 'top' : 'center',
            },
            props.style,
          ]}
        />
        {accessory}
      </View>
      {hint && (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      )}
    </View>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole={error ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[
        ui.notice,
        { backgroundColor: error ? theme.dangerSoft : theme.accent2Soft },
      ]}
    >
      <ThemedText
        type="small"
        style={{ color: error ? theme.danger : theme.accent2Text }}
      >
        {children}
      </ThemedText>
    </View>
  );
}
export function Loading({
  label = 'Getting things ready…',
}: {
  label?: string;
}) {
  const theme = useTheme();
  return (
    <View style={ui.loading} accessibilityLiveRegion="polite">
      <ActivityIndicator color={theme.accentText} />
      <ThemedText themeColor="textSecondary">{label}</ThemedText>
    </View>
  );
}
export function Empty({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <Card>
      <TextGroup>
        <ThemedText type="subtitle">{title}</ThemedText>
        <ThemedText themeColor="textSecondary">{detail}</ThemedText>
      </TextGroup>
      {action && onAction && (
        <Button secondary onPress={onAction}>
          {action}
        </Button>
      )}
    </Card>
  );
}
export function Chip({
  children,
  selected,
  onPress,
  disabled,
}: {
  children: ReactNode;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        ui.chip,
        {
          backgroundColor: selected
            ? theme.accentText
            : theme.backgroundElement,
          borderColor: selected ? theme.accentText : theme.divider,
        },
      ]}
    >
      <ThemedText
        type="smallBold"
        style={{ color: selected ? theme.background : theme.text }}
      >
        {children}
      </ThemedText>
    </Pressable>
  );
}
export const ui = StyleSheet.create({
  heading: { gap: Spacing.label },
  section: { gap: Spacing.section },
  fields: { gap: Spacing.field },
  screen: {
    padding: Layout.gutter,
    gap: Spacing.section,
    width: '100%',
    maxWidth: Layout.maxWidth,
    alignSelf: 'center',
    paddingBottom: Spacing.spacious,
  },
  footer: {
    paddingHorizontal: Layout.gutter,
    paddingVertical: Spacing.field,
    borderTopWidth: 1,
    gap: Spacing.inline,
    width: '100%',
    maxWidth: Layout.maxWidth,
    alignSelf: 'center',
  },
  card: {
    padding: Spacing.field,
    borderRadius: Radius.lg,
    gap: Spacing.field,
    borderWidth: 1,
  },
  button: {
    minHeight: Layout.controlHeight,
    borderRadius: Radius.md,
    paddingVertical: Spacing.inline,
    paddingHorizontal: Spacing.field,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.label,
  },
  textButton: {
    minHeight: Layout.touchTarget,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.label,
    paddingVertical: Spacing.label,
  },
  iconButton: {
    minWidth: Layout.touchTarget,
    minHeight: Layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  inputFrame: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: Layout.controlHeight,
    borderRadius: Radius.md,
    padding: Spacing.inline,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Fonts.body,
  },
  notice: { padding: Spacing.inline, borderRadius: Radius.md },
  loading: {
    padding: Spacing.spacious,
    gap: Spacing.field,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.inline,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.label },
  chip: {
    minHeight: Layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: Spacing.field,
    paddingVertical: Spacing.label,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
});

export function Toggle(props: SwitchProps) {
  const theme = useTheme();
  return (
    <NativeSwitch
      {...props}
      trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
      thumbColor={props.value ? theme.accentText : theme.textSecondary}
    />
  );
}
