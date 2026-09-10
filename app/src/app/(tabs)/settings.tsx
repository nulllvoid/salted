import { useState } from 'react';
import { Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ThemedText } from '@/components/themed-text';
import {
  Toggle,
  Button,
  Card,
  Chip,
  Field,
  Loading,
  Notice,
  Screen,
  ui,
} from '@/components/ui';
import { CollapsibleSection } from '@/components/collapsible-section';
import { MealEditor } from '@/components/meal-editor';
import { useActiveGroup } from '@/contexts/active-group';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { useAction } from '@/hooks/use-action';
import { useFlatSettings } from '@/hooks/use-flat-settings';
import type { GroupSummary } from '@/hooks/use-my-groups';
import { DIET_ORDER, dietLabel } from '@/lib/diet-copy';
import { formatMealTime } from '@/lib/meal-schedule';
import { supabase } from '@/lib/supabase';
import { CookForm } from '@/components/cook-form';
const ALLERGIES = ['peanut', 'dairy', 'gluten', 'shellfish', 'soy'];
export default function SettingsScreen() {
  const router = useRouter();
  const session = useSession();
  const {
    groups,
    activeGroup,
    error: groupError,
    reloadGroups,
  } = useActiveGroup();
  const { profile, error, updateProfile, reload } = useProfile(
    session?.user.id,
  );
  const action = useAction();
  const [feedback, setFeedback] = useState('');
  const [sent, setSent] = useState(false);
  const [signOut, setSignOut] = useState(false);
  return (
    <Screen>
      <View style={{ gap: 8 }}>
        <ThemedText type="smallBold" themeColor="accentText">
          MAKE YOURSELF AT HOME
        </ThemedText>
        <ThemedText type="title">Settings</ThemedText>
        <ThemedText themeColor="textSecondary">
          A few details for meals that work for everyone.
        </ThemedText>
      </View>
      {(error || groupError || action.error) && (
        <>
          <Notice error>{error || groupError || action.error}</Notice>
          <Button
            secondary
            onPress={() => {
              void reload();
              void reloadGroups();
            }}
          >
            Try again
          </Button>
        </>
      )}
      {profile === undefined && !error && <Loading />}
      {profile && (
        <Card>
          <ThemedText type="subtitle">Your preferences</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Your household’s suggestions respect everyone’s dietary preferences.
          </ThemedText>
          <View style={ui.wrap}>
            {DIET_ORDER.map((type) => (
              <Chip
                key={type}
                selected={profile.diet_type === type}
                onPress={() => {
                  void action.run(() => updateProfile({ diet_type: type }));
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
              disabled={action.pending}
              value={profile.is_jain}
              onValueChange={(value) => {
                void action.run(() => updateProfile({ is_jain: value }));
              }}
            />
          </View>
          <ThemedText type="smallBold">Allergies</ThemedText>
          <View style={ui.wrap}>
            {ALLERGIES.map((allergy) => (
              <Chip
                key={allergy}
                selected={profile.allergies.includes(allergy)}
                onPress={() => {
                  void action.run(() =>
                    updateProfile({
                      allergies: profile.allergies.includes(allergy)
                        ? profile.allergies.filter((a) => a !== allergy)
                        : [...profile.allergies, allergy],
                    }),
                  );
                }}
              >
                {allergy}
              </Chip>
            ))}
          </View>
          {action.pending && (
            <ThemedText type="small" themeColor="textSecondary">
              Saving your preferences…
            </ThemedText>
          )}
        </Card>
      )}
      <ThemedText type="subtitle">Your households</ThemedText>
      {groups?.map((group) => (
        <Household key={group.id} group={group} userId={session?.user.id} />
      ))}
      <View style={{ gap: 10 }}>
        <Button
          secondary
          onPress={() => router.push('/onboarding/create-group')}
        >
          Create a household
        </Button>
        <Button secondary onPress={() => router.push('/onboarding/join-group')}>
          Join with an invite code
        </Button>
      </View>
      <Card>
        <ThemedText type="subtitle">How’s it going?</ThemedText>
        <Field
          label="Feedback"
          placeholder="Something we could make better?"
          multiline
          value={feedback}
          maxLength={2000}
          onChangeText={(v) => {
            setFeedback(v);
            setSent(false);
          }}
        />
        {sent && <Notice>Thanks. Your feedback has been saved.</Notice>}
        <Button
          busy={action.pending}
          disabled={!feedback.trim()}
          onPress={() => {
            void action.run(async () => {
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
            busy={action.pending}
            onPress={() => {
              void action.run(async () => {
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
    </Screen>
  );
}
function Household({
  group,
  userId,
}: {
  group: GroupSummary;
  userId?: string;
}) {
  const { reloadGroups } = useActiveGroup();
  const { data, error, reload, updateFlat, upsertCook, leaveFlat } =
    useFlatSettings(group.id);
  const [addMeal, setAddMeal] = useState(false);
  const [leave, setLeave] = useState(false);
  const [copied, setCopied] = useState(false);
  const action = useAction();
  if (!data)
    return (
      <Card>
        {error ? (
          <>
            <Notice error>{error}</Notice>
            <Button
              secondary
              onPress={() => {
                void reload();
              }}
            >
              Retry household
            </Button>
          </>
        ) : (
          <Loading />
        )}
      </Card>
    );
  return (
    <Card>
      <ThemedText type="subtitle">{group.name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {data.members.map((m) => m.displayName).join(' · ')}
      </ThemedText>
      {action.error && <Notice error>{action.error}</Notice>}
      <CollapsibleSection
        title="Invite your housemates"
        summary="Share a code to plan together"
      >
        <ThemedText selectable type="subtitle">
          {data.flat.invite_code}
        </ThemedText>
        <Button
          secondary
          onPress={() => {
            void action.run(async () => {
              await Clipboard.setStringAsync(data.flat.invite_code);
              setCopied(true);
            });
          }}
        >
          {copied ? 'Code copied' : 'Copy invite code'}
        </Button>
        <Button
          secondary
          onPress={() => {
            void action.run(() =>
              Share.share({
                message: `Join ${group.name} on Salted. Choose “Join with an invite code” and enter ${data.flat.invite_code}.`,
              }),
            );
          }}
        >
          Share invite
        </Button>
      </CollapsibleSection>
      {group.meals.map((meal) => (
        <CollapsibleSection
          key={meal.id}
          title={meal.name}
          summary={`Served ${formatMealTime(meal.serve_time)} · menu closes ${formatMealTime(meal.close_time)}`}
        >
          <MealEditor
            groupId={group.id}
            meal={meal}
            canRemove={group.meals.length > 1}
          />
        </CollapsibleSection>
      ))}
      <Button secondary onPress={() => setAddMeal(!addMeal)}>
        {addMeal ? 'Cancel new meal' : 'Add a meal'}
      </Button>
      {addMeal && (
        <MealEditor groupId={group.id} onDone={() => setAddMeal(false)} />
      )}
      <CollapsibleSection
        title="Menu size"
        summary="Preferences, not hard limits"
      >
        <ThemedText type="small" themeColor="textSecondary">
          We’ll let you know when your menu has more dishes than you usually
          need.
        </ThemedText>
        {[
          { label: 'Main dishes', key: 'max_mains' as const },
          { label: 'Rice, breads & sides', key: 'max_accompaniments' as const },
        ].map(({ label, key }) => (
          <View key={key} style={ui.row}>
            <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
            <Button
              secondary
              disabled={action.pending || (data.flat[key] ?? 2) <= 1}
              onPress={() => {
                void action.run(() =>
                  updateFlat({ [key]: Math.max(1, (data.flat[key] ?? 2) - 1) }),
                );
              }}
            >
              −
            </Button>
            <ThemedText>{data.flat[key] ?? 2}</ThemedText>
            <Button
              secondary
              disabled={action.pending}
              onPress={() => {
                void action.run(() =>
                  updateFlat({ [key]: (data.flat[key] ?? 2) + 1 }),
                );
              }}
            >
              +
            </Button>
          </View>
        ))}
      </CollapsibleSection>
      <CollapsibleSection
        title="Your cook"
        summary={data.cook?.name ?? 'Add your cook’s details'}
        defaultOpen={!data.cook}
      >
        <CookForm cook={data.cook} save={upsertCook} />
      </CollapsibleSection>
      <Button secondary onPress={() => setLeave(!leave)}>
        Leave household
      </Button>
      {leave && (
        <>
          <Notice>
            You’ll lose access to this household’s meals. You can rejoin with an
            invite code.
          </Notice>
          <Button secondary onPress={() => setLeave(false)}>
            Keep my membership
          </Button>
          <Button
            busy={action.pending}
            onPress={() => {
              void action.run(async () => {
                await leaveFlat(userId!);
                await reloadGroups();
              });
            }}
          >
            Leave {group.name}
          </Button>
        </>
      )}
    </Card>
  );
}
