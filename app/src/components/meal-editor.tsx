import { useState } from 'react';
import { Button, Card, Chip, Field, Notice, ui } from './ui';
import { ThemedText } from './themed-text';
import { View } from 'react-native';
import { useAction } from '@/hooks/use-action';
import { useActiveGroup } from '@/contexts/active-group';
import { supabase } from '@/lib/supabase';
import {
  formatMealTime,
  mealDefaults,
  validateMeal,
  type Meal,
} from '@/lib/meal-schedule';
export function MealEditor({
  groupId,
  meal,
  canRemove = false,
  onDone,
}: {
  groupId: string;
  meal?: Meal;
  canRemove?: boolean;
  onDone?: () => void;
}) {
  const { reloadGroups } = useActiveGroup();
  const [draft, setDraft] = useState({
    name: meal?.name ?? 'Dinner',
    basis: meal?.basis ?? 'full',
    serve_time: meal?.serve_time.slice(0, 5) ?? '20:30',
    close_time: meal?.close_time.slice(0, 5) ?? '16:00',
    open_offset_min: String((meal?.open_offset_min ?? 690) / 60),
    dispatch_offset_min: String(meal?.dispatch_offset_min ?? 270),
  });
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const action = useAction();
  const values = {
    ...draft,
    open_offset_min: Number(draft.open_offset_min) * 60,
    dispatch_offset_min: Number(draft.dispatch_offset_min),
  };
  const validation = validateMeal(values);
  function field(key: keyof typeof draft, value: string) {
    setSaved(false);
    setDraft((d) => ({ ...d, [key]: value }));
  }
  async function save() {
    if (validation) return;
    const ok = await action.run(async () => {
      if (meal)
        await supabase
          .from('flat_meals')
          .update(values)
          .eq('id', meal.id)
          .eq('flat_id', groupId)
          .select('id')
          .single()
          .throwOnError();
      else
        await supabase
          .from('flat_meals')
          .insert({ ...values, flat_id: groupId })
          .throwOnError();
      await reloadGroups();
    });
    if (ok) {
      setSaved(true);
      onDone?.();
    }
  }
  return (
    <View style={{ gap: 16 }}>
      {!meal && (
        <View style={ui.wrap}>
          {Object.entries(mealDefaults).map(([key, value]) => (
            <Chip
              key={key}
              onPress={() =>
                setDraft({
                  ...value,
                  open_offset_min: String(value.open_offset_min / 60),
                  dispatch_offset_min: String(value.dispatch_offset_min),
                })
              }
            >
              {value.name}
            </Chip>
          ))}
        </View>
      )}
      <Field
        label="Meal name"
        value={draft.name}
        onChangeText={(v) => field('name', v)}
        maxLength={60}
      />
      <ThemedText type="smallBold">What kind of meal?</ThemedText>
      <View style={ui.wrap}>
        {[
          { value: 'breakfast', label: 'Breakfast' },
          { value: 'light', label: 'Light meal' },
          { value: 'full', label: 'Full meal' },
        ].map((b) => (
          <Chip
            key={b.value}
            selected={draft.basis === b.value}
            onPress={() => field('basis', b.value)}
          >
            {b.label}
          </Chip>
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        This guides dish suggestions. All times below are in IST, using the
        24-hour clock.
      </ThemedText>
      <Field
        label="Serve at"
        placeholder="20:30"
        value={draft.serve_time}
        onChangeText={(v) => field('serve_time', v)}
        maxLength={5}
      />
      <Field
        label="Close menu at"
        placeholder="16:00"
        value={draft.close_time}
        onChangeText={(v) => field('close_time', v)}
        maxLength={5}
      />
      <Field
        label="Open menu this many hours before serving"
        keyboardType="decimal-pad"
        value={draft.open_offset_min}
        onChangeText={(v) => field('open_offset_min', v)}
      />
      <Field
        label="Prepare cook message this many minutes before serving"
        keyboardType="number-pad"
        value={draft.dispatch_offset_min}
        onChangeText={(v) => field('dispatch_offset_min', v)}
      />
      {validation && <Notice error>{validation}</Notice>}
      {action.error && <Notice error>{action.error}</Notice>}
      {saved && (
        <Notice>
          Schedule saved. The next scheduled check will use these times.
        </Notice>
      )}
      <Button
        disabled={!!validation}
        busy={action.pending}
        onPress={() => {
          void save();
        }}
      >
        Save meal schedule
      </Button>
      {meal && canRemove && (
        <Button
          secondary
          disabled={action.pending}
          onPress={() => setConfirmRemove(!confirmRemove)}
        >
          Remove meal
        </Button>
      )}
      {confirmRemove && (
        <Card>
          <ThemedText>
            Stop planning {meal?.name}? Existing menus remain in your household
            history.
          </ThemedText>
          <Button secondary onPress={() => setConfirmRemove(false)}>
            Keep meal
          </Button>
          <Button
            busy={action.pending}
            onPress={() => {
              void action.run(async () => {
                await supabase
                  .from('flat_meals')
                  .update({ is_active: false })
                  .eq('id', meal!.id)
                  .throwOnError();
                await reloadGroups();
              });
            }}
          >
            Stop planning this meal
          </Button>
        </Card>
      )}
      {!validation && (
        <ThemedText type="small" themeColor="textSecondary">
          Menu closes at {formatMealTime(draft.close_time)}. Each meal gets its
          own cook message.
        </ThemedText>
      )}
    </View>
  );
}
