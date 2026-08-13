import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CollapsibleSection } from '@/components/collapsible-section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useActiveGroup } from '@/contexts/active-group';
import { useFlatSettings } from '@/hooks/use-flat-settings';
import type { GroupSummary } from '@/hooks/use-my-groups';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { DIET_ORDER, dietHelperText, dietLabel } from '@/lib/diet-copy';
import { MEAL_ORDER, mealLabel } from '@/lib/meal-copy';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';
import type { MealType } from '@/types/domain';

const ALLERGY_OPTIONS = ['peanut', 'dairy', 'gluten', 'shellfish', 'soy'] as const;
const COOK_LANGUAGES = [
  { value: 'hi', label: 'Hindi' },
  { value: 'kn', label: 'Kannada' },
  { value: 'en', label: 'English' },
] as const;

const DEFAULT_MAX_MAINS = 4;
const DEFAULT_MAX_ACCOMPANIMENTS = 2;

function cookLanguageLabel(value: string): string {
  return COOK_LANGUAGES.find((lang) => lang.value === value)?.label ?? value;
}

export default function SettingsScreen() {
  const router = useRouter();
  const session = useSession();
  const { groups, activeGroup } = useActiveGroup();
  const { profile, updateProfile } = useProfile(session?.user.id);
  const theme = useTheme();

  const [feedback, setFeedback] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  async function submitFeedback() {
    if (!session?.user.id || !feedback.trim()) return;
    const { error } = await supabase
      .from('feedback')
      .insert({ user_id: session.user.id, flat_id: activeGroup?.id ?? null, body: feedback.trim() });
    if (!error) {
      setFeedback('');
      setFeedbackSent(true);
      setTimeout(() => setFeedbackSent(false), 3000);
    }
  }

  function toggleAllergy(allergy: string) {
    if (!profile) return;
    const has = profile.allergies.includes(allergy);
    const next = has ? profile.allergies.filter((a) => a !== allergy) : [...profile.allergies, allergy];
    updateProfile({ allergies: next });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="subtitle">Settings</ThemedText>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">My dietary profile</ThemedText>

          <ThemedView style={styles.chipRow}>
            {DIET_ORDER.map((type) => {
              const selected = profile?.diet_type === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => updateProfile({ diet_type: type })}
                  style={[
                    styles.chip,
                    { borderColor: theme.divider },
                    selected && { backgroundColor: theme.accent, borderColor: theme.accent },
                  ]}>
                  <ThemedText type="small" style={selected ? { color: theme.background } : undefined}>
                    {dietLabel(type)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ThemedView>
          <ThemedText type="small" themeColor="textSecondary">
            {dietHelperText()}
          </ThemedText>

          <ThemedView style={styles.rowBetween}>
            <ThemedText type="default">Jain</ThemedText>
            <Switch
              value={profile?.is_jain ?? false}
              onValueChange={(value) => void updateProfile({ is_jain: value })}
            />
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary">
            Allergies
          </ThemedText>
          <ThemedView style={styles.chipRow}>
            {ALLERGY_OPTIONS.map((allergy) => {
              const selected = profile?.allergies.includes(allergy) ?? false;
              return (
                <Pressable
                  key={allergy}
                  onPress={() => toggleAllergy(allergy)}
                  style={[
                    styles.chip,
                    { borderColor: theme.divider },
                    selected && { backgroundColor: theme.accent, borderColor: theme.accent },
                  ]}>
                  <ThemedText type="small" style={selected ? { color: theme.background } : undefined}>
                    {allergy}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ThemedView>

          <ThemedView style={styles.rowBetween}>
            <ThemedText type="default">Mute notifications</ThemedText>
            <Switch
              value={profile?.notifications_muted ?? false}
              onValueChange={(value) => void updateProfile({ notifications_muted: value })}
            />
          </ThemedView>
        </ThemedView>

        <ThemedText type="smallBold" style={styles.groupsLabel}>
          My groups
        </ThemedText>
        {groups?.map((group) => (
          <GroupCard key={group.id} group={group} userId={session?.user.id} />
        ))}

        <ThemedView style={styles.addGroupRow}>
          <Pressable
            style={[styles.secondaryButton, styles.addGroupButton, { borderColor: theme.divider }]}
            onPress={() => router.push('/onboarding/create-group')}>
            <ThemedText type="smallBold">Create group</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, styles.addGroupButton, { borderColor: theme.divider }]}
            onPress={() => router.push('/onboarding/join-group')}>
            <ThemedText type="smallBold">Join group</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Send feedback</ThemedText>
          <TextInput
            placeholder="Tell us what's not working…"
            placeholderTextColor={theme.textSecondary}
            multiline
            value={feedback}
            onChangeText={setFeedback}
            style={[styles.feedbackInput, { borderColor: theme.divider, color: theme.text, backgroundColor: theme.background }]}
          />
          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.accent }, !feedback.trim() && styles.disabled]}
            onPress={submitFeedback}
            disabled={!feedback.trim()}>
            <ThemedText type="smallBold" style={[styles.primaryButtonText, { color: theme.background }]}>
              {feedbackSent ? 'Sent — thank you' : 'Submit'}
            </ThemedText>
          </Pressable>
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

// One card per group: meal, invite code, timings, members, soft limits, cook,
// and leave-with-confirmation. Each card is its own component instance so
// useFlatSettings(group.id) runs per card without hook-in-loop issues.
function GroupCard({ group, userId }: { group: GroupSummary; userId: string | undefined }) {
  const router = useRouter();
  const { groups, setGroupMeals, reloadGroups } = useActiveGroup();
  const { data, updateFlat, upsertCook, leaveFlat } = useFlatSettings(group.id);
  const theme = useTheme();
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Lives here, not inside PollTimesSection: a successful save changes
  // flat.poll_*_time, which changes PollTimesSection's own key prop
  // (below), remounting it — a status flag stored in that child would be
  // wiped by the remount before it ever renders.
  const [pollTimesStatus, setPollTimesStatus] = useState<SaveStatus>('idle');

  if (!data) return null; // loading

  const { flat, members, cook } = data;
  const maxMains = flat.max_mains ?? DEFAULT_MAX_MAINS;
  const maxAccompaniments = flat.max_accompaniments ?? DEFAULT_MAX_ACCOMPANIMENTS;

  async function handleLeave() {
    if (!userId) return;
    const wasLastGroup = (groups?.length ?? 0) <= 1;
    await leaveFlat(userId);
    await reloadGroups();
    if (wasLastGroup) {
      router.replace('/onboarding/choose');
    }
  }

  // A group must keep at least one meal — tapping the only selected chip is
  // a no-op rather than leaving the group meal-less.
  function toggleMeal(meal: MealType) {
    const next = group.meals.includes(meal)
      ? group.meals.filter((m) => m !== meal)
      : [...group.meals, meal];
    if (next.length === 0) return;
    void setGroupMeals(group.id, next);
  }

  async function savePollTimes(patch: { poll_open_time: string; poll_close_time: string; dispatch_time: string }) {
    setPollTimesStatus('saving');
    const result = await updateFlat(patch);
    setPollTimesStatus(result?.error ? 'error' : 'saved');
    setTimeout(() => setPollTimesStatus('idle'), 3000);
  }

  return (
    <ThemedView type="backgroundElement" style={styles.section}>
      <ThemedText type="smallBold">{flat.name}</ThemedText>

      <ThemedView style={styles.chipRow}>
        {MEAL_ORDER.map((meal) => {
          const selected = group.meals.includes(meal);
          return (
            <Pressable
              key={meal}
              onPress={() => toggleMeal(meal)}
              style={[
                styles.chip,
                { borderColor: theme.divider },
                selected && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}>
              <ThemedText type="small" style={selected ? { color: theme.background } : undefined}>
                {mealLabel(meal)}
              </ThemedText>
            </Pressable>
          );
        })}
      </ThemedView>

      <ThemedText type="small" themeColor="textSecondary">
        Invite code: {flat.invite_code}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Members: {members.map((m) => m.displayName).join(', ')}
      </ThemedText>

      <CollapsibleSection
        title="Poll times"
        summary={`${toHHMM(flat.poll_open_time)} · ${toHHMM(flat.poll_close_time)} · ${toHHMM(flat.dispatch_time)}`}>
        <PollTimesSection
          key={`${flat.poll_open_time}-${flat.poll_close_time}-${flat.dispatch_time}`}
          pollOpenTime={flat.poll_open_time}
          pollCloseTime={flat.poll_close_time}
          dispatchTime={flat.dispatch_time}
          status={pollTimesStatus}
          onSave={savePollTimes}
        />
      </CollapsibleSection>

      <LimitStepper
        label="Main courses per meal"
        value={maxMains}
        onChange={(value) => void updateFlat({ max_mains: Math.max(1, value) })}
        accentColor={theme.accent}
      />
      <LimitStepper
        label="Accompaniments & sides"
        value={maxAccompaniments}
        onChange={(value) => void updateFlat({ max_accompaniments: Math.max(1, value) })}
        accentColor={theme.accent}
      />

      {/* Open by default until a cook exists: a group can't be dispatched to
          without one, so hiding the empty form behind a tap buries the single
          most important thing a new group still has to do. */}
      <CollapsibleSection
        title="Cook"
        summary={cook ? `${cook.name} · ${cookLanguageLabel(cook.language)}` : 'Not set'}
        defaultOpen={!cook}>
        <CookSection key={cook?.id ?? 'new'} cook={cook} onSave={(patch) => upsertCook(patch)} />
      </CollapsibleSection>

      {!confirmLeave ? (
        <Pressable onPress={() => setConfirmLeave(true)}>
          <ThemedText type="smallBold" style={{ color: theme.danger }}>
            Leave group
          </ThemedText>
        </Pressable>
      ) : (
        <ThemedView style={styles.rowBetween}>
          <ThemedText type="small" style={{ color: theme.danger }}>
            Leave {flat.name}?
          </ThemedText>
          <ThemedView style={styles.confirmActions}>
            <Pressable
              style={[styles.confirmButton, { borderColor: theme.divider }]}
              onPress={() => setConfirmLeave(false)}>
              <ThemedText type="smallBold">Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, styles.confirmLeaveButton, { backgroundColor: theme.danger }]}
              onPress={() => void handleLeave()}>
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                Leave
              </ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>
      )}
    </ThemedView>
  );
}

function LimitStepper({
  label,
  value,
  onChange,
  accentColor,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  accentColor: string;
}) {
  return (
    <ThemedView style={styles.rowBetween}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedView style={styles.stepper}>
        <Pressable style={[styles.stepperButton, { backgroundColor: accentColor }]} onPress={() => onChange(value - 1)}>
          <ThemedText type="smallBold" style={styles.stepperButtonText}>
            −
          </ThemedText>
        </Pressable>
        <ThemedText type="default" style={styles.stepperValue}>
          {value}
        </ThemedText>
        <Pressable style={[styles.stepperButton, { backgroundColor: accentColor }]} onPress={() => onChange(value + 1)}>
          <ThemedText type="smallBold" style={styles.stepperButtonText}>
            +
          </ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

// Mounted with `key={cook?.id ?? 'new'}` by the parent so its local state
// initializes from `cook` once (via useState initializers) instead of
// syncing via a useEffect + setState, which the React Compiler lint flags
// as an unnecessary render-triggering side effect.
function CookSection({
  cook,
  onSave,
}: {
  cook: Tables<'cooks'> | null;
  onSave: (patch: { name: string; phone: string; language: string }) => void;
}) {
  const [cookName, setCookName] = useState(cook?.name ?? '');
  const [cookPhone, setCookPhone] = useState(cook?.phone ?? '');
  const [cookLanguage, setCookLanguage] = useState(cook?.language ?? 'hi');
  const theme = useTheme();

  function saveCook() {
    if (!cookName.trim() || !cookPhone.trim()) return;
    onSave({ name: cookName.trim(), phone: cookPhone.trim(), language: cookLanguage });
  }

  return (
    <ThemedView style={styles.cookSection}>
      <ThemedText type="smallBold">Cook</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Changes take effect at the next dispatch.
      </ThemedText>
      <TextInput
        placeholder="Cook name"
        placeholderTextColor={theme.textSecondary}
        value={cookName}
        onChangeText={setCookName}
        style={[styles.input, { borderColor: theme.divider, color: theme.text, backgroundColor: theme.background }]}
      />
      <TextInput
        placeholder="Phone (+91XXXXXXXXXX)"
        placeholderTextColor={theme.textSecondary}
        value={cookPhone}
        onChangeText={setCookPhone}
        keyboardType="phone-pad"
        style={[styles.input, { borderColor: theme.divider, color: theme.text, backgroundColor: theme.background }]}
      />
      <ThemedView style={styles.chipRow}>
        {COOK_LANGUAGES.map((lang) => {
          const selected = cookLanguage === lang.value;
          return (
            <Pressable
              key={lang.value}
              onPress={() => setCookLanguage(lang.value)}
              style={[
                styles.chip,
                { borderColor: theme.divider },
                selected && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}>
              <ThemedText type="small" style={selected ? { color: theme.background } : undefined}>
                {lang.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ThemedView>
      <Pressable
        style={[styles.primaryButton, { backgroundColor: theme.accent }, (!cookName.trim() || !cookPhone.trim()) && styles.disabled]}
        onPress={saveCook}
        disabled={!cookName.trim() || !cookPhone.trim()}>
        <ThemedText type="smallBold" style={[styles.primaryButtonText, { color: theme.background }]}>
          {cook ? 'Update cook' : 'Add cook'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toHHMM(dbTime: string): string {
  return dbTime.slice(0, 5);
}

// Mounted with a key derived from the current DB values (same pattern as
// CookSection) so local draft state re-seeds only when the saved values
// actually change underneath it, not on every parent re-render.
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function PollTimesSection({
  pollOpenTime,
  pollCloseTime,
  dispatchTime,
  status,
  onSave,
}: {
  pollOpenTime: string;
  pollCloseTime: string;
  dispatchTime: string;
  status: SaveStatus;
  onSave: (patch: { poll_open_time: string; poll_close_time: string; dispatch_time: string }) => void;
}) {
  const [openDraft, setOpenDraft] = useState(toHHMM(pollOpenTime));
  const [closeDraft, setCloseDraft] = useState(toHHMM(pollCloseTime));
  const [dispatchDraft, setDispatchDraft] = useState(toHHMM(dispatchTime));
  const theme = useTheme();

  const allValid = [openDraft, closeDraft, dispatchDraft].every((t) => TIME_RE.test(t));
  // Same-day ordering only — the daily pipeline assumes open < close <
  // dispatch within one IST day (create_poll/close_poll/dispatch_cook each
  // act on whatever poll the prior stage already produced).
  const inOrder = allValid && openDraft < closeDraft && closeDraft < dispatchDraft;
  const dirty = openDraft !== toHHMM(pollOpenTime) || closeDraft !== toHHMM(pollCloseTime) || dispatchDraft !== toHHMM(dispatchTime);

  function save() {
    if (!inOrder) return;
    onSave({ poll_open_time: `${openDraft}:00`, poll_close_time: `${closeDraft}:00`, dispatch_time: `${dispatchDraft}:00` });
  }

  return (
    <ThemedView style={styles.cookSection}>
      <ThemedText type="smallBold">Poll times (IST)</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Suggestions open, cart locks, cook is messaged — in that order, each day.
      </ThemedText>

      <ThemedView style={styles.chipRow}>
        <PollTimeField label="Suggestions open" value={openDraft} onChangeText={setOpenDraft} theme={theme} />
        <PollTimeField label="Cart locks" value={closeDraft} onChangeText={setCloseDraft} theme={theme} />
        <PollTimeField label="Cook messaged" value={dispatchDraft} onChangeText={setDispatchDraft} theme={theme} />
      </ThemedView>

      {allValid && !inOrder && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          Each time must come after the one before it.
        </ThemedText>
      )}
      {!allValid && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          Use 24-hour HH:MM, e.g. 09:00.
        </ThemedText>
      )}

      <Pressable
        style={[styles.primaryButton, { backgroundColor: theme.accent }, (!dirty || !inOrder || status === 'saving') && styles.disabled]}
        onPress={save}
        disabled={!dirty || !inOrder || status === 'saving'}>
        <ThemedText type="smallBold" style={[styles.primaryButtonText, { color: theme.background }]}>
          {status === 'saving' ? 'Saving…' : 'Save poll times'}
        </ThemedText>
      </Pressable>

      {status === 'saved' && (
        <ThemedText type="small" style={{ color: theme.accent }}>
          Saved.
        </ThemedText>
      )}
      {status === 'error' && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          Couldn&apos;t save — check your connection and try again.
        </ThemedText>
      )}
    </ThemedView>
  );
}

// HH:MM string -> a Date carrying just that time (today's date, seconds
// zeroed) — the shape @react-native-community/datetimepicker's `value` prop
// needs. The date part is never read back out, only hours/minutes.
function hhmmToDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function PollTimeField({
  label,
  value,
  onChangeText,
  theme,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  // DateTimePickerAndroid.open() is the documented imperative API. `onChange`
  // is @deprecated in this version (even passed to the imperative API, it
  // still fires the library's own console warning) — onValueChange is its
  // replacement and is what actually reports the picked time back. This app
  // is Android-first for the pilot (CLAUDE.md), so no iOS fallback is needed.
  function openPicker() {
    DateTimePickerAndroid.open({
      value: TIME_RE.test(value) ? hhmmToDate(value) : new Date(),
      mode: 'time',
      is24Hour: true,
      onValueChange: (_event, date) => {
        onChangeText(dateToHHMM(date));
      },
    });
  }

  return (
    <ThemedView style={styles.pollTimeField}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Pressable
        onPress={openPicker}
        style={[styles.input, styles.pollTimeInput, { borderColor: theme.divider, backgroundColor: theme.background }]}>
        <ThemedText type="default" style={{ color: theme.text }}>
          {TIME_RE.test(value) ? value : '--:--'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  section: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    gap: Spacing.two,
  },
  groupsLabel: {
    marginTop: Spacing.two,
  },
  cookSection: {
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  feedbackInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 16,
    fontFamily: Fonts.body,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.two,
    fontSize: 16,
    fontFamily: Fonts.body,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pollTimeField: {
    flex: 1,
    minWidth: 90,
    gap: Spacing.half,
  },
  pollTimeInput: {
    alignItems: 'center',
  },
  chip: {
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    color: '#ffffff',
  },
  stepperValue: {
    minWidth: 24,
    textAlign: 'center',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  confirmButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  confirmLeaveButton: {
    borderWidth: 0,
  },
  primaryButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.pill,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  secondaryButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  addGroupRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  addGroupButton: {
    flex: 1,
  },
  disabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
  },
});
