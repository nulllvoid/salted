import { TextGroup } from '@/components/text-group';
import { Spacing } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, View } from 'react-native';
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
import { CollapsibleSection } from '@/components/collapsible-section';
import { DaySwitch } from '@/components/day-switch';
import { HouseholdTabs } from '@/components/household-tabs';
import { useActiveGroup } from '@/contexts/active-group';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { useTodayCart } from '@/hooks/use-today-cart';
import { useAction } from '@/hooks/use-action';
import {
  formatMealTime,
  istDate,
  mealMoment,
  menuStatusLabel,
  suggestionsPendingCopy,
} from '@/lib/meal-schedule';
import { LockCountdown } from '@/components/lock-countdown';
import { friendlyError } from '@/lib/errors';
import { dietLabel } from '@/lib/diet-copy';
import type { CartLineView, RecipeKind, SuggestionView } from '@/types/domain';
const CATEGORIES: { kind: RecipeKind; label: string }[] = [
  { kind: 'main', label: 'Mains' },
  { kind: 'accompaniment', label: 'Rice & breads' },
  { kind: 'side', label: 'Sides' },
];

export default function TodayScreen() {
  const { activeGroup, activeMeal, pollDate } = useActiveGroup();
  return (
    <TodayContent key={`${activeGroup?.id}:${activeMeal?.id}:${pollDate}`} />
  );
}
function TodayContent() {
  const router = useRouter();
  const context = useActiveGroup();
  const {
    groups,
    activeGroup,
    activeMeal,
    pollDate,
    setActiveMealId,
    setDayOffset,
  } = context;
  const session = useSession();
  const state = useTodayCart(activeGroup?.id, session?.user.id);
  const { cart, headcount } = state;
  const action = useAction();
  const theme = useTheme();
  const [category, setCategory] = useState<RecipeKind>('main');
  const [searchOpen, setSearchOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [fallback, setFallback] = useState<SuggestionView | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);
  const contextKey = `${activeGroup?.id}:${activeMeal?.id}:${pollDate}`;
  const editable = cart?.status === 'open';
  const tomorrow = pollDate !== istDate();
  const error = context.error || state.error || action.error;
  async function add(option: SuggestionView) {
    const succeeded = await action.run(() => state.addToCart(option.recipeId));
    if (succeeded) {
      const count =
        (cart?.cartLines.filter((l) =>
          option.kind === 'main' ? l.kind === 'main' : l.kind !== 'main',
        ).length ?? 0) + 1;
      const limit =
        option.kind === 'main' ? cart?.maxMains : cart?.maxAccompaniments;
      setFeedback(
        limit && count > limit
          ? `${option.name} added. Your menu now exceeds the household’s preferred dish count.`
          : `${option.name} added to the menu.`,
      );
    }
    return succeeded;
  }
  return (
    <Screen
      footer={
        cart && cart.cartLines.length > 0 ? (
          <>
            <View style={ui.row}>
              <ThemedText type="smallBold">
                {cart.cartLines.length}{' '}
                {cart.cartLines.length === 1 ? 'dish' : 'dishes'} · {headcount}{' '}
                eating
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {editable ? 'Shared menu' : 'Menu confirmed'}
              </ThemedText>
            </View>
            <Button onPress={() => router.push('/grocery-list')}>
              View household groceries
            </Button>
          </>
        ) : undefined
      }
    >
      <View style={ui.row}>
        <View style={{ flex: 1 }}>
          <ThemedText type="eyebrow" themeColor="accentText">
            SALTED / YOUR SHARED TABLE
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {activeGroup?.name ?? 'Your household'}
          </ThemedText>
        </View>
        <Button
          secondary
          onPress={() => {
            void state.reload();
            void context.reloadGroups();
          }}
          label="Refresh meals"
          icon="refresh"
        >
          {null}
        </Button>
      </View>
      <HouseholdTabs />
      <View style={{ gap: Spacing.inline }}>
        <View style={[ui.row, { flexWrap: 'wrap' }]}>
          <ThemedText type="title">
            {activeMeal?.name ?? 'Your next meal'}
          </ThemedText>
        </View>
        {/* Meal and day on one row: the day is a property OF the selected
            meal ("Breakfast, tomorrow" is one answer), not a third
            independent axis. Rendering them as separate peer rows of
            identical pills hid that. Meals keep their own chips and wrap
            freely — a household may have any number of them — while the day
            sits at the row's end as a quiet segmented control. */}
        <View style={[ui.row, { flexWrap: 'wrap', gap: Spacing.label }]}>
            <View style={[ui.wrap, { flexGrow: 1, flexBasis: 280 }]}>
            {(activeGroup?.meals.length ?? 0) > 1 &&
              activeGroup?.meals.map((m) => (
                <Chip
                  key={m.id}
                  selected={m.id === activeMeal?.id}
                  onPress={() => setActiveMealId(m.id)}
                >
                  {m.name}
                </Chip>
              ))}
          </View>
          <DaySwitch tomorrow={tomorrow} onChange={setDayOffset} />
        </View>
        {activeMeal && (
          <ThemedText themeColor="textSecondary">
            At {formatMealTime(activeMeal.serve_time)} · all times IST
          </ThemedText>
        )}
      </View>
      {error && <Notice error>{error}</Notice>}
      {cart === undefined && !error && (
        <Loading label="Getting your shared menu…" />
      )}
      {!activeMeal && groups && (
        <Empty
          title="Let’s set the table"
          detail="Add a meal schedule to start planning together."
          action="Set up meals"
          onAction={() =>
            router.push({
              pathname: '/(tabs)/settings',
              params: { section: 'meals' },
            })
          }
        />
      )}
      {activeMeal &&
        cart === null &&
        (() => {
          const pending = suggestionsPendingCopy(activeMeal, pollDate);
          return (
            <Empty
              title={pending.title}
              detail={pending.detail}
              action={pending.canRefresh ? 'Refresh suggestions' : undefined}
              onAction={
                pending.canRefresh
                  ? () => {
                      void state.reload();
                    }
                  : undefined
              }
            />
          );
        })()}
      {cart && (
        <>
          {editable && (
            <LockCountdown
              closesAt={mealMoment(pollDate, activeMeal?.close_time ?? '16:00')}
            />
          )}
          <Card>
            <View style={ui.row}>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold">
                  {headcount} {headcount === 1 ? 'person' : 'people'} eating
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {editable
                    ? `Make changes until ${formatMealTime(activeMeal?.close_time ?? '16:00')}`
                    : 'This menu is no longer editable'}
                </ThemedText>
              </View>
              <Button secondary onPress={() => router.push('/who-is-eating')}>
                Who’s in?
              </Button>
            </View>
            <View style={ui.row}>
              <ThemedText>I’m eating this meal</ThemedText>
              <Toggle
                accessibilityLabel="I'm eating this meal"
                value={!cart.isOutToday}
                disabled={!editable || action.pending}
                onValueChange={(value) => {
                  void action.run(() => state.setOutToday(!value));
                }}
                trackColor={{ true: theme.accentText }}
              />
            </View>
          </Card>
          {feedback && <Notice>{feedback}</Notice>}
          {headcount === 0 && (
            <Notice>
              No one is eating yet. Mark someone in before adding dishes.
            </Notice>
          )}
          {cart.status === 'cancelled' && (
            <Empty
              title="Meal skipped"
              detail="There’s no menu for this meal. Your next meal is available from the switcher above."
            />
          )}
          <View style={{ gap: Spacing.field }}>
            <View style={ui.row}>
              <ThemedText type="subtitle">
                {editable ? 'On the menu' : 'Your menu'}
              </ThemedText>
              <ThemedText type="small" themeColor="accentText">
                {menuStatusLabel(cart.status, cart.cartLines.length)}
              </ThemedText>
            </View>
            {cart.cartLines.length === 0 ? (
              <Card>
                <TextGroup>
                  <ThemedText type="subtitle">
                    Start with something good.
                  </ThemedText>
                  <ThemedText themeColor="textSecondary">
                    {editable
                      ? 'Pick a dish below. Everyone in your household sees the same menu.'
                      : 'No dishes were chosen before the menu closed. No empty instructions will be sent.'}
                  </ThemedText>
                </TextGroup>
                {cart.status === 'closed' && headcount > 0 && (
                  <>
                    <Button
                      secondary
                      busy={action.pending}
                      onPress={() => {
                        void action.run(async () => {
                          const found = await state.getFallbackSuggestions();
                          setFallback(found.main);
                          if (!found.main)
                            setFeedback(
                              'No suitable backup dish is available. Please coordinate this meal with your cook.',
                            );
                        });
                      }}
                    >
                      Find a backup dish
                    </Button>
                    {fallback && (
                      <Button
                        busy={action.pending}
                        onPress={() => {
                          void action.run(async () => {
                            const result = await state.takeFallback(
                              fallback.recipeId,
                            );
                            if (result?.error) throw result.error;
                            setFallback(null);
                          });
                        }}
                      >
                        Choose {fallback.name}
                      </Button>
                    )}
                  </>
                )}
              </Card>
            ) : (
              cart.cartLines.map((line) => (
                <MenuRow
                  key={line.recipeId}
                  line={line}
                  editable={!!editable}
                  disabled={action.pending}
                  headcount={headcount}
                  onChange={(quantity) => {
                    void action.run(async () => {
                      await state.setQuantity(line.recipeId, quantity);
                    });
                  }}
                />
              ))
            )}
          </View>
          {editable && (
            <View style={{ gap: Spacing.field }}>
              <TextGroup>
                <ThemedText type="subtitle">A few ideas</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Picked around your household’s dietary preferences.
                </ThemedText>
              </TextGroup>
              <View style={ui.wrap}>
                {CATEGORIES.map((c) => (
                  <Chip
                    key={c.kind}
                    selected={category === c.kind}
                    onPress={() => setCategory(c.kind)}
                  >
                    {c.label}
                  </Chip>
                ))}
              </View>
              {cart.suggestions
                .filter((s) => s.kind === category && !s.inCart)
                .map((option) => (
                  <Card key={option.recipeId}>
                    <View style={ui.row}>
                      <View style={{ flex: 1, gap: Spacing.micro }}>
                        <ThemedText type="bodyBold">{option.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {option.cuisine.replaceAll('_', ' ')} ·{' '}
                          {dietLabel(option.dietClass)}
                        </ThemedText>
                      </View>
                      <Button
                        disabled={action.pending || headcount === 0}
                        onPress={() => {
                          void add(option);
                        }}
                        label={`Add ${option.name}`}
                      >
                        + Add
                      </Button>
                    </View>
                  </Card>
                ))}
              {!cart.suggestions.some(
                (s) => s.kind === category && !s.inCart,
              ) && (
                <ThemedText themeColor="textSecondary">
                  No more suggestions here. Search for something you like.
                </ThemedText>
              )}
              <Button
                secondary
                onPress={() => {
                  action.setError(null);
                  setSearchOpen(true);
                }}
              >
                Search for a dish
              </Button>
            </View>
          )}
          {cart.cartLines.length > 0 && !editable && (
            <Card>
              <TextGroup>
                <ThemedText type="subtitle">Next stop: your cook.</ThemedText>
                <ThemedText themeColor="textSecondary">
                  Check the message and its delivery status. You can send a
                  prepared message yourself through WhatsApp.
                </ThemedText>
              </TextGroup>
              <Button
                secondary
                onPress={() => router.push('/cook-message-preview')}
              >
                Cook instructions
              </Button>
            </Card>
          )}
          {!!cart.activity.length && (
            <CollapsibleSection
              title="Household activity"
              summary={`${cart.activity.length} recent updates`}
            >
              {cart.activity.slice(0, 6).map((entry) => (
                <View key={entry.id} style={{ gap: Spacing.micro }}>
                  <ThemedText type="small">
                    {entry.actorDisplayName ?? 'A housemate'}{' '}
                    {entry.eventType === 'attendance_change'
                      ? entry.isOut
                        ? 'is sitting this meal out'
                        : 'is eating this meal'
                      : `${entry.eventType === 'cart_add' ? 'added' : entry.eventType === 'cart_remove' ? 'removed' : 'updated'} ${entry.recipeName}`}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {new Date(entry.createdAt).toLocaleTimeString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </ThemedText>
                </View>
              ))}
            </CollapsibleSection>
          )}
        </>
      )}
      <Search
        key={`${contextKey}:${category}`}
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        search={state.searchRecipes}
        kind={category}
        onAdd={add}
        disabled={action.pending || !editable || headcount === 0}
        addError={action.error}
      />
    </Screen>
  );
}
function MenuRow({
  line,
  editable,
  disabled,
  headcount,
  onChange,
}: {
  line: CartLineView;
  editable: boolean;
  disabled: boolean;
  headcount: number;
  onChange: (q: number) => void;
}) {
  return (
    <Card>
      <View style={{ gap: Spacing.label }}>
        <ThemedText type="itemTitle">{line.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {line.quantity} {line.quantity === 1 ? 'serving' : 'servings'}
          {line.updatedByDisplayName
            ? ` · edited by ${line.updatedByDisplayName}`
            : ''}
        </ThemedText>
      </View>
      {editable && (
        <View style={[ui.row, { flexWrap: 'wrap' }]}>
          <View style={[ui.row, { justifyContent: 'flex-start' }]}>
            <Button
              secondary
              disabled={disabled}
              icon="minus"
              label={`Decrease servings of ${line.name}`}
              onPress={() => onChange(line.quantity - 1)}
            >
              {null}
            </Button>
            <ThemedText type="smallBold">{line.quantity}</ThemedText>
            <Button
              icon="plus"
              secondary
              disabled={disabled || line.quantity >= headcount}
              label={`Increase servings of ${line.name}`}
              onPress={() => onChange(line.quantity + 1)}
            >
              {null}
            </Button>
          </View>
          <Button
            secondary
            disabled={disabled}
            label={`Remove ${line.name}`}
            onPress={() => onChange(0)}
          >
            Remove
          </Button>
        </View>
      )}
    </Card>
  );
}
function Search({
  visible,
  onClose,
  search,
  kind,
  onAdd,
  disabled,
  addError,
}: {
  visible: boolean;
  onClose: () => void;
  search: (kind: RecipeKind, query: string) => Promise<SuggestionView[]>;
  kind: RecipeKind;
  onAdd: (o: SuggestionView) => Promise<boolean>;
  disabled: boolean;
  addError?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SuggestionView[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);
  useEffect(() => {
    let cancelled = false;
    if (!visible || query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        const found = await searchRef.current(kind, query);
        if (!cancelled) setResults(found);
      } catch (cause) {
        if (!cancelled) setError(friendlyError(cause));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, query, kind]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen>
        <View style={[ui.row, { alignItems: 'flex-start' }]}>
          <ThemedText type="subtitle" style={{ flex: 1 }}>
            Find a dish
          </ThemedText>
          <Button textOnly onPress={onClose}>
            Close
          </Button>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Searching{' '}
          {CATEGORIES.find(
            (category) => category.kind === kind,
          )?.label.toLowerCase()}{' '}
          that match your household’s food preferences.
        </ThemedText>
        <Field
          label="Dish name"
          placeholder={
            kind === 'main'
              ? 'Try dal or paneer'
              : kind === 'accompaniment'
                ? 'Try rice or roti'
                : 'Try salad or raita'
          }
          autoFocus
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setError('');
            setResults([]);
            setSearching(value.trim().length >= 2);
          }}
        />
        {error && <Notice error>{error}</Notice>}
        {addError && <Notice error>{addError}</Notice>}
        {searching && <Loading label="Finding dishes…" />}
        {!searching &&
          query.trim().length >= 2 &&
          !results.length &&
          !error && (
            <Notice>
              No matches for your household’s preferences. Try another dish
              name.
            </Notice>
          )}
        {query.trim().length < 2 && (
          <ThemedText themeColor="textSecondary">
            Enter at least two letters to search.
          </ThemedText>
        )}
        {results.map((option) => (
          <Card key={option.recipeId}>
            <ThemedText>{option.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {option.cuisine.replaceAll('_', ' ')} ·{' '}
              {dietLabel(option.dietClass)}
            </ThemedText>
            <Button
              disabled={disabled || option.inCart}
              onPress={() => {
                void onAdd(option).then((ok) => {
                  if (ok) onClose();
                });
              }}
            >
              {option.inCart ? 'Already on the menu' : 'Add to menu'}
            </Button>
          </Card>
        ))}
      </Screen>
    </Modal>
  );
}
