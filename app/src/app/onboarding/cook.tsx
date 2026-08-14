import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useActiveGroup } from '@/contexts/active-group';
import { useFlatSettings } from '@/hooks/use-flat-settings';
import { useTheme } from '@/hooks/use-theme';

const COOK_LANGUAGES = [
  { value: 'hi', label: 'Hindi' },
  { value: 'kn', label: 'Kannada' },
  { value: 'en', label: 'English' },
] as const;

// Final create-group step (mockup: "who's actually doing the cooking?" + the
// invite code). Writes the same `cooks` row Settings' Cook section already
// edits — front-loaded here so a fresh group has a cook set before the first
// dispatch. The group id arrives as a route param from create-group.tsx
// (falling back to the active group when reached another way).
export default function OnboardingCookScreen() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const { activeGroup } = useActiveGroup();
  const flatId = groupId ?? activeGroup?.id;
  const { data: flatData, upsertCook } = useFlatSettings(flatId);
  const theme = useTheme();

  const [cookName, setCookName] = useState('');
  const [cookPhone, setCookPhone] = useState('');
  const [cookLanguage, setCookLanguage] = useState<'hi' | 'kn' | 'en'>('hi');
  const [copied, setCopied] = useState(false);

  // Share the raw code, not a salted.app/j/ URL — the deep link isn't live
  // yet and a dead link in the first minute costs trust.
  const inviteCode = flatData?.flat.invite_code ?? '';

  async function copyInvite() {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function finish() {
    if (cookName.trim() && cookPhone.trim()) {
      await upsertCook({ name: cookName.trim(), phone: cookPhone.trim(), language: cookLanguage });
    }
    router.replace('/(tabs)');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.kicker}>
          Your household
        </ThemedText>
        <ThemedText type="title" style={styles.heading}>
          who&apos;s actually doing the cooking?
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          They never install anything. They get one clear WhatsApp message, in their language.
        </ThemedText>

        <TextInput
          placeholder="Cook's name"
          placeholderTextColor={theme.textSecondary}
          value={cookName}
          onChangeText={setCookName}
          style={[styles.input, { borderColor: theme.divider, color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <TextInput
          placeholder="+91 …"
          placeholderTextColor={theme.textSecondary}
          value={cookPhone}
          onChangeText={setCookPhone}
          keyboardType="phone-pad"
          style={[styles.input, { borderColor: theme.divider, color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <ThemedView style={styles.segRow}>
          {COOK_LANGUAGES.map(({ value, label }) => {
            const selected = cookLanguage === value;
            return (
              <Pressable
                key={value}
                onPress={() => setCookLanguage(value)}
                style={[
                  styles.segOption,
                  { borderColor: theme.divider },
                  selected && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}>
                <ThemedText type="smallBold" style={selected ? { color: theme.background } : undefined}>
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </ThemedView>

        {flatData && (
          <Pressable
            onPress={copyInvite}
            style={[styles.inviteBox, { borderColor: theme.divider, backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">Drag the rest of the group in</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {copied ? 'Copied!' : `Invite code: ${inviteCode} — tap to copy`}
            </ThemedText>
          </Pressable>
        )}

        <Pressable style={[styles.primaryButton, { backgroundColor: theme.accent }]} onPress={finish}>
          <ThemedText type="smallBold" style={[styles.primaryButtonText, { color: theme.background }]}>
            Done. Let&apos;s eat.
          </ThemedText>
        </Pressable>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  kicker: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heading: {
    fontSize: 34,
    lineHeight: 38,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    fontSize: 16,
    fontFamily: Fonts.body,
  },
  segRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  segOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  inviteBox: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: Spacing.half,
  },
  primaryButton: {
    marginTop: 'auto',
    paddingVertical: Spacing.three,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: Fonts.bodyBold,
  },
});
