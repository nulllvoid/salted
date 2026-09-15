import { TextGroup } from '@/components/text-group';
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Field, Notice, Screen, ui } from '@/components/ui';
import { useActiveGroup } from '@/contexts/active-group';
import { useAction } from '@/hooks/use-action';
import { supabase } from '@/lib/supabase';
import { mealDefaults } from '@/lib/meal-schedule';
import type { MealType } from '@/types/domain';
export default function CreateGroupScreen() {
  const router = useRouter();
  const { reloadGroups, setActiveGroupId } = useActiveGroup();
  const [name, setName] = useState('');
  const [meals, setMeals] = useState<MealType[]>(['dinner']);
  const action = useAction();
  return (
    <Screen
      footer={
        <Button
          busy={action.pending}
          disabled={!name.trim() || !meals.length}
          onPress={() => {
            void action.run(async () => {
              const { data, error } = await supabase.rpc('create_household', {
                p_name: name.trim(),
                p_meals: meals,
              });
              if (error) throw error;
              await reloadGroups();
              setActiveGroupId(data!);
              router.replace({
                pathname: '/onboarding/cook',
                params: { groupId: data! },
              });
            });
          }}
        >
          Create household
        </Button>
      }
    >
      <Button textOnly icon="back" onPress={() => router.back()}>
        Back
      </Button>
      <TextGroup>
        <ThemedText type="eyebrow" themeColor="accentText">
          YOUR HOUSEHOLD · 1 OF 2
        </ThemedText>
        <ThemedText type="title">A table of your own.</ThemedText>
        <ThemedText themeColor="textSecondary">
          One shared space for your housemates, your meals, and your cook.
        </ThemedText>
      </TextGroup>
      <Card>
        <Field
          label="Household name"
          placeholder="e.g. The Indiranagar flat"
          value={name}
          onChangeText={setName}
          editable={!action.pending}
          maxLength={80}
        />
        <ThemedText type="smallBold">Which meals do you share?</ThemedText>
        <View style={ui.wrap}>
          {Object.entries(mealDefaults).map(([key, meal]) => (
            <Chip
              key={key}
              selected={meals.includes(key as MealType)}
              disabled={action.pending}
              onPress={() =>
                setMeals((current) =>
                  current.includes(key as MealType)
                    ? current.filter((m) => m !== key)
                    : [...current, key as MealType],
                )
              }
            >
              {meal.name}
            </Chip>
          ))}
        </View>
        <ThemedText
          type="small"
          themeColor={meals.length ? 'textSecondary' : 'danger'}
        >
          {meals.length
            ? 'Each meal has its own menu and schedule. You can adjust the times in Settings.'
            : 'Choose at least one shared meal to continue.'}
        </ThemedText>
      </Card>
      {action.error && <Notice error>{action.error}</Notice>}
    </Screen>
  );
}
