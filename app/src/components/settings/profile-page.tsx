import { TextGroup } from '@/components/text-group';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  Button,
  Card,
  Chip,
  Field,
  Loading,
  Notice,
  Toggle,
  ui,
} from '@/components/ui';
import { useActiveGroup } from '@/contexts/active-group';
import { useAction } from '@/hooks/use-action';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { DIET_ORDER, dietLabel } from '@/lib/diet-copy';
import { supabase } from '@/lib/supabase';

const ALLERGIES = ['peanut', 'dairy', 'gluten', 'shellfish', 'soy'];

// User-scoped settings: dietary preferences, feedback, sign out. No household
// switcher here — none of this is per-household.
export function ProfilePage() {
  const router = useRouter();
  const session = useSession();
  const { activeGroup } = useActiveGroup();
  const { profile, error, updateProfile, reload } = useProfile(
    session?.user.id,
  );

  // Two action instances on purpose. useAction serialises calls through a
  // `locked` ref, so a single shared instance means a diet chip tap swallows a
  // feedback submit made moments later, and an error from one blanks the
  // other's. Splitting them is the point of giving each section its own state.
  const prefs = useAction();
  const account = useAction();

  const [feedback, setFeedback] = useState('');
  const [sent, setSent] = useState(false);
  const [signOut, setSignOut] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  async function savePreferences(patch: Parameters<typeof updateProfile>[0]) {
    setPrefsSaved(false);
    setPrefsSaved(await prefs.run(() => updateProfile(patch)));
  }

  if (profile === undefined && !error) return <Loading />;

  return (
    <>
      {error && (
        <Card>
          <Notice error>{error}</Notice>
          <Button
            secondary
            onPress={() => {
              void reload();
            }}
          >
            Try again
          </Button>
        </Card>
      )}

      {profile && (
        <Card>
          <TextGroup>
            <ThemedText type="subtitle">Your preferences</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Your household’s suggestions respect everyone’s dietary
              preferences.
            </ThemedText>
          </TextGroup>
          {prefs.error && <Notice error>{prefs.error}</Notice>}
          <View style={ui.wrap}>
            {DIET_ORDER.map((type) => (
              <Chip
                key={type}
                selected={profile.diet_type === type}
                disabled={prefs.pending}
                onPress={() => {
                  void savePreferences({ diet_type: type });
                }}
              >
                {dietLabel(type)}
              </Chip>
            ))}
          </View>
          <View style={ui.row}>
            <ThemedText>Jain food</ThemedText>
            <Toggle
              accessibilityLabel="Jain food"
              disabled={prefs.pending}
              value={profile.is_jain}
              onValueChange={(value) => {
                void savePreferences({ is_jain: value });
              }}
            />
          </View>
          <ThemedText type="smallBold">Allergies</ThemedText>
          <View style={ui.wrap}>
            {ALLERGIES.map((allergy) => (
              <Chip
                key={allergy}
                selected={profile.allergies.includes(allergy)}
                disabled={prefs.pending}
                onPress={() => {
                  void savePreferences({
                    allergies: profile.allergies.includes(allergy)
                      ? profile.allergies.filter((a) => a !== allergy)
                      : [...profile.allergies, allergy],
                  });
                }}
              >
                {allergy}
              </Chip>
            ))}
          </View>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            accessibilityLiveRegion="polite"
          >
            {prefs.pending
              ? 'Saving your preferences…'
              : prefsSaved
                ? 'Preferences saved.'
                : 'Changes save automatically.'}
          </ThemedText>
        </Card>
      )}

      <Card>
        <ThemedText type="subtitle">How’s it going?</ThemedText>
        {account.error && <Notice error>{account.error}</Notice>}
        <Field
          label="Feedback"
          placeholder="Something we could make better?"
          multiline
          numberOfLines={4}
          style={{ minHeight: 112 }}
          value={feedback}
          maxLength={2000}
          onChangeText={(v) => {
            setFeedback(v);
            setSent(false);
          }}
        />
        {sent && <Notice>Thanks. Your feedback has been saved.</Notice>}
        <Button
          busy={account.pending}
          disabled={!feedback.trim()}
          onPress={() => {
            void account.run(async () => {
              await supabase
                .from('feedback')
                .insert({
                  user_id: session!.user.id,
                  flat_id: activeGroup?.id ?? null,
                  body: feedback.trim(),
                })
                .throwOnError();
              setFeedback('');
              setSent(true);
            });
          }}
        >
          Send feedback
        </Button>
      </Card>

      <Button secondary onPress={() => setSignOut(!signOut)}>
        Sign out
      </Button>
      {signOut && (
        <Card>
          <ThemedText>
            Sign out on this device? Your household and meals will be saved.
          </ThemedText>
          <Button secondary onPress={() => setSignOut(false)}>
            Stay signed in
          </Button>
          <Button
            busy={account.pending}
            onPress={() => {
              void account.run(async () => {
                const result = await supabase.auth.signOut();
                if (result.error) throw result.error;
                router.replace('/onboarding');
              });
            }}
          >
            Sign out of Salted
          </Button>
        </Card>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        Salted · shared meals, less back-and-forth.
      </ThemedText>
    </>
  );
}
