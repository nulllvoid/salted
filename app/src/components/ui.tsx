import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Switch as NativeSwitch,
  type SwitchProps,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

export function Screen({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={ui.screen}
        >
          {children}
        </ScrollView>
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
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
  label?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        ui.button,
        {
          backgroundColor: secondary ? 'transparent' : theme.accentText,
          borderColor: secondary ? theme.divider : theme.accentText,
          opacity: disabled || busy ? 0.5 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {busy && (
        <ActivityIndicator color={secondary ? theme.text : theme.background} />
      )}
      <ThemedText
        type="smallBold"
        style={{
          color: secondary ? theme.text : theme.background,
          textAlign: 'center',
        }}
      >
        {children}
      </ThemedText>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        {...props}
        style={[
          ui.input,
          {
            color: theme.text,
            backgroundColor: theme.background,
            borderColor: theme.divider,
          },
          props.style,
        ]}
      />
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
      <ThemedText type="subtitle">{title}</ThemedText>
      <ThemedText themeColor="textSecondary">{detail}</ThemedText>
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
}: {
  children: ReactNode;
  selected?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
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
  screen: {
    padding: 20,
    gap: 20,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingBottom: 40,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    gap: 10,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  card: { padding: 16, borderRadius: 20, gap: 14, borderWidth: 1 },
  button: {
    minHeight: 48,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    fontFamily: Fonts.body,
  },
  notice: { padding: 14, borderRadius: 14 },
  loading: { padding: 36, gap: 16, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
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
