import { TextGroup } from '@/components/text-group';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import {
  Toggle,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Loading,
  Notice,
  Screen,
  ui,
} from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { useAction } from '@/hooks/use-action';
import { DIET_ORDER, dietLabel } from '@/lib/diet-copy';
import type { Tables, TablesUpdate } from '@/types/database';
export default function ProfileScreen() {
  const session = useSession();
  const { profile, error, updateProfile, reload } = useProfile(
    session?.user.id,
  );
  if (error)
    return (
      <Screen>
        <Empty
          title="Couldn’t load your profile"
          detail={error}
          action="Try again"
          onAction={() => {
            void reload();
          }}
        />
      </Screen>
    );
  if (!profile)
    return (
      <Screen>
        <Loading label="Getting your profile ready…" />
      </Screen>
    );
  return (
    <ProfileForm key={profile.id} profile={profile} save={updateProfile} />
  );
}
function ProfileForm({
  profile,
  save,
}: {
  profile: Tables<'profiles'>;
  save: (p: TablesUpdate<'profiles'>) => Promise<unknown>;
}) {
  const router = useRouter();
  const [name, setName] = useState(profile.display_name);
  const [diet, setDiet] = useState(profile.diet_type);
  const [jain, setJain] = useState(profile.is_jain);
  const [allergies, setAllergies] = useState(profile.allergies);
  const action = useAction();
  return (
    <Screen>
      <TextGroup>
        <ThemedText type="eyebrow" themeColor="accentText">
          FIRST, A LITTLE ABOUT YOU
        </ThemedText>
        <ThemedText type="title">Made for your taste.</ThemedText>
        <ThemedText themeColor="textSecondary">
          Help us suggest dishes that work for you and your housemates.
        </ThemedText>
      </TextGroup>
      <Card>
        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          maxLength={60}
        />
        <ThemedText type="smallBold">What do you eat?</ThemedText>
        <View style={ui.wrap}>
          {DIET_ORDER.map((value) => (
            <Chip
              key={value}
              selected={diet === value}
              onPress={() => setDiet(value)}
            >
              {dietLabel(value)}
            </Chip>
          ))}
        </View>
        <View style={ui.row}>
          <ThemedText>Jain food</ThemedText>
          <Toggle
            accessibilityLabel="Jain food"
            value={jain}
            onValueChange={setJain}
          />
        </View>
      </Card>
      <Card>
        <ThemedText type="smallBold">Any allergies?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          We exclude dishes containing these ingredients from suggestions.
        </ThemedText>
        <View style={ui.wrap}>
          {['peanut', 'dairy', 'gluten', 'shellfish', 'soy'].map((allergy) => (
            <Chip
              key={allergy}
              selected={allergies.includes(allergy)}
              onPress={() =>
                setAllergies((a) =>
                  a.includes(allergy)
                    ? a.filter((v) => v !== allergy)
                    : [...a, allergy],
                )
              }
            >
              {allergy}
            </Chip>
          ))}
        </View>
      </Card>
      {action.error && <Notice error>{action.error}</Notice>}
      <Button
        disabled={!name.trim()}
        busy={action.pending}
        onPress={() => {
          void action
            .run(() =>
              save({
                display_name: name.trim(),
                diet_type: diet,
                is_jain: jain,
                allergies,
              }),
            )
            .then((ok) => {
              if (ok) router.replace('/onboarding/choose');
            });
        }}
      >
        Save and continue
      </Button>
    </Screen>
  );
}
