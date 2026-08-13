import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CollapsibleSection } from '@/components/collapsible-section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useActiveGroup } from '@/contexts/active-group';
import { useSession } from '@/hooks/use-session';
import { useStreak } from '@/hooks/use-streak';
import { useTheme } from '@/hooks/use-theme';
import { useTodayCart } from '@/hooks/use-today-cart';
import { mealMomentList, mealNounList, mealTitleList } from '@/lib/meal-copy';
import type { ActivityEntry, CartLineView, MealType, RecipeKind, SuggestionView } from '@/types/domain';

const TABS: RecipeKind[] = ['main', 'accompaniment', 'side'];
const TAB_LABEL: Record<RecipeKind, string> = { main: 'Mains', accompaniment: 'With it', side: 'Sides' };
const KIND_LABEL: Record<RecipeKind, string> = { main: 'Mains', accompaniment: 'Accompaniments', side: 'Sides' };
const SEARCH_LABEL: Record<RecipeKind, string> = { main: 'a main course', accompaniment: 'an accompaniment', side: 'a side' };

// Fixed dark-card palette for the locked-cart moment (mockup screen 12) —
// deliberately theme-independent, same idea as the mockup's own --dk/--dks/
// --dkl/--dkt/--dka tokens: this card looks the same whether the rest of
// the app is in light or dark mode.
const LOCKED_CARD = {
  bg: '#1A1411',
  surface: '#261D18',
  divider: '#352822',
  textSecondary: '#C5B7AC',
  accent: '#FF9B62',
};

export default function TodayScreen() {
  const router = useRouter();
  const session = useSession();
  const { groups, activeGroup, setActiveGroupId } = useActiveGroup();
  const flatId = activeGroup?.id;
  const meals = activeGroup?.meals ?? ['dinner'];
  const {
    cart,
    headcount,
    addToCart,
    setQuantity,
    removeFromCart,
    setOutToday,
    searchRecipes,
    getFallbackSuggestions,
    takeFallback,
  } = useTodayCart(flatId, session?.user.id);
  const { streak } = useStreak(flatId);
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<RecipeKind>('main');
  const [cappedRecipeId, setCappedRecipeId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [limitWarning, setLimitWarning] = useState<{ recipeId: string; recipeName: string; limit: number; count: number } | null>(
    null
  );

  if (cart === undefined) {
    return null; // loading
  }

  if (cart === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.container}>
          <MealChips groups={groups} activeGroupId={activeGroup?.id} onSelect={setActiveGroupId} />
          <ThemedText type="subtitle">No {mealNounList(meals)} suggestions yet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Suggestions land at your group&apos;s poll-open time.
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    );
  }

  const availableSuggestions = cart.suggestions.filter((s) => !s.inCart);
  const suggestionsByKind = groupByKind(availableSuggestions);
  const cartLinesByKind = groupByKind(cart.cartLines);

  // Soft, warn-not-block cap (docs/05-schema.sql flats.max_mains /
  // max_accompaniments) — 'accompaniment' and 'side' cart lines count
  // toward the single combined max_accompaniments cap (Phase 4 decision:
  // one column covers both, not a separate cap per kind).
  async function addToCartWithLimitCheck(recipeId: string, recipeName: string) {
    await addToCart(recipeId);
    if (!cart) return;
    const kind = [...cart.suggestions, ...cart.cartLines].find((r) => r.recipeId === recipeId)?.kind;
    const limit = kind === 'main' ? cart.maxMains : cart.maxAccompaniments;
    if (limit === null || limit === undefined) return;
    const newCount =
      kind === 'main'
        ? cartLinesByKind.main.length + 1
        : cartLinesByKind.accompaniment.length + cartLinesByKind.side.length + 1;
    if (newCount > limit) {
      setLimitWarning({ recipeId, recipeName, limit, count: newCount });
    }
  }

  async function undoLimitWarning() {
    if (!limitWarning) return;
    await removeFromCart(limitWarning.recipeId);
    setLimitWarning(null);
  }

  // Headcount is a hard cap, not the soft dish-count limit above — a
  // quantity above headcount means more portions than people to eat them.
  // setQuantity already silently caps server-side; this just surfaces why a
  // + tap did nothing instead of leaving the user guessing.
  async function incrementQuantity(recipeId: string, nextQuantity: number) {
    const result = await setQuantity(recipeId, nextQuantity);
    if (result.capped) {
      setCappedRecipeId(recipeId);
      setTimeout(() => setCappedRecipeId((current) => (current === recipeId ? null : current)), 2500);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <MealChips groups={groups} activeGroupId={activeGroup?.id} onSelect={setActiveGroupId} />

        <ThemedView style={styles.headerRow}>
          <ThemedView>
            <ThemedText type="subtitle">{mealTitleList(meals)}</ThemedText>
            <Pressable onPress={() => router.push('/who-is-eating')}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.headcountLink}>
                {headcount} eating {mealMomentList(meals)}
              </ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.outToggleRow}>
          <ThemedText type="default">I&apos;m out today</ThemedText>
          <Switch value={cart.isOutToday} onValueChange={setOutToday} />
        </ThemedView>

        {cart.status === 'closed' && cart.cartLines.length === 0 && (
          <EmptyCartAtLock
            flatId={flatId}
            meals={meals}
            takeFallback={takeFallback}
            getFallbackSuggestions={getFallbackSuggestions}
          />
        )}

        {(cart.status === 'closed' || cart.status === 'dispatched') && cart.cartLines.length > 0 && (
          <ThemedView style={[styles.lockedCard, { backgroundColor: LOCKED_CARD.bg }]}>
            <ThemedText type="small" style={[styles.lockedKicker, { color: LOCKED_CARD.accent }]}>
              cart locked
            </ThemedText>

            <ThemedView style={[styles.lockedDishSurface, { backgroundColor: LOCKED_CARD.surface }]}>
              {cart.cartLines.map((line, i) => (
                <ThemedView key={line.recipeId} style={styles.transparent}>
                  {i > 0 && <ThemedView style={[styles.lockedDivider, { backgroundColor: LOCKED_CARD.divider }]} />}
                  <ThemedView style={[styles.lockedDishRow, styles.transparent]}>
                    <ThemedText type="default" style={styles.lockedDishName}>
                      {line.name}
                    </ThemedText>
                    <ThemedText type="small" style={{ color: LOCKED_CARD.textSecondary }}>
                      {KIND_LABEL[line.kind].replace(/s$/, '').toLowerCase()} · ×{line.quantity}
                    </ThemedText>
                  </ThemedView>
                </ThemedView>
              ))}
            </ThemedView>

            <ThemedText type="small" style={[styles.lockedStat, { color: LOCKED_CARD.textSecondary }]}>
              {cart.cartLines.length} {cart.cartLines.length === 1 ? 'dish' : 'dishes'}, {headcount}{' '}
              {headcount === 1 ? 'person' : 'people'}.
            </ThemedText>

            {!!streak && streak > 0 && (
              <ThemedView style={[styles.streakTag, { backgroundColor: LOCKED_CARD.surface }]}>
                <ThemedText type="small" style={{ color: LOCKED_CARD.accent }}>
                  {streak}-day streak{streak > 1 ? ' — unbroken' : ''}
                </ThemedText>
              </ThemedView>
            )}

            <ThemedView style={[styles.lockedActions, styles.transparent]}>
              <Pressable style={[styles.actionButton, { backgroundColor: theme.accent }]} onPress={() => router.push('/grocery-list')}>
                <ThemedText type="smallBold" style={[styles.actionButtonText, { color: theme.background }]}>
                  Grocery list
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.actionButtonOutline, { borderColor: LOCKED_CARD.divider }]}
                onPress={() => router.push('/cook-message-preview')}>
                <ThemedText type="smallBold" style={styles.lockedOutlineText}>
                  Preview cook message
                </ThemedText>
              </Pressable>
            </ThemedView>
          </ThemedView>
        )}

        {!cart.isLocked && (
          <ThemedView style={styles.section}>
            <ThemedView style={[styles.tabRow, { backgroundColor: theme.backgroundElement }]}>
              {TABS.map((kind) => {
                const selected = activeTab === kind;
                const count = cartLinesByKind[kind].length;
                return (
                  <Pressable
                    key={kind}
                    onPress={() => setActiveTab(kind)}
                    style={[styles.tabOption, selected && { backgroundColor: theme.accentSoft }]}>
                    <ThemedText
                      type="smallBold"
                      style={selected ? { color: theme.accentText } : { color: theme.textSecondary }}>
                      {TAB_LABEL[kind]}
                      {count > 0 ? ` · ${count}` : ''}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ThemedView>

            {limitWarning && (
              <ThemedView style={[styles.warningCard, { backgroundColor: theme.dangerSoft }]}>
                <ThemedText type="small" style={[styles.warningKicker, { color: theme.danger }]}>
                  Beyond your limit — not a rule
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: theme.danger }}>
                  That&apos;s {limitWarning.count} {limitWarning.count === 1 ? 'dish' : 'dishes'} for a limit of{' '}
                  {limitWarning.limit}.
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.danger }}>
                  You set the ceiling at {limitWarning.limit}. The cook can absolutely handle more, this is just a
                  heads-up.
                </ThemedText>
                <ThemedView style={styles.warningActions}>
                  <Pressable
                    style={[styles.warningButton, { backgroundColor: theme.background }]}
                    onPress={undoLimitWarning}>
                    <ThemedText type="smallBold" style={{ color: theme.danger }}>
                      Undo
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.warningButton, { backgroundColor: theme.danger }]}
                    onPress={() => setLimitWarning(null)}>
                    <ThemedText type="smallBold" style={{ color: theme.background }}>
                      Keep it anyway
                    </ThemedText>
                  </Pressable>
                </ThemedView>
              </ThemedView>
            )}

            {cartLinesByKind[activeTab].length > 0 && (
              <ThemedView style={styles.optionsList}>
                <ThemedText type="small" themeColor="textSecondary">
                  In the cart
                </ThemedText>
                {cartLinesByKind[activeTab].map((line) => (
                  <CartLineRow
                    key={line.recipeId}
                    line={line}
                    locked={false}
                    accentColor={theme.accent}
                    showCappedMessage={cappedRecipeId === line.recipeId}
                    onIncrement={() => void incrementQuantity(line.recipeId, line.quantity + 1)}
                    onDecrement={() => void setQuantity(line.recipeId, line.quantity - 1)}
                    onRemove={() => removeFromCart(line.recipeId)}
                  />
                ))}
              </ThemedView>
            )}

            {suggestionsByKind[activeTab].length > 0 && (
              <ThemedView style={styles.optionsList}>
                <ThemedText type="small" themeColor="textSecondary">
                  Suggestions — what you haven&apos;t eaten lately
                </ThemedText>
                {suggestionsByKind[activeTab].map((option) => (
                  <Pressable
                    key={option.recipeId}
                    onPress={() => addToCartWithLimitCheck(option.recipeId, option.name)}
                    style={({ pressed }) => [styles.optionCard, pressed && styles.optionCardPressed]}>
                    <ThemedText type="default" style={styles.optionName}>
                      {option.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {option.cuisine} · {option.dietClass}
                    </ThemedText>
                  </Pressable>
                ))}
              </ThemedView>
            )}

            <Pressable
              onPress={() => setSearchOpen(true)}
              style={[styles.searchEntry, { borderColor: theme.divider }]}>
              <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                Search for a dish
              </ThemedText>
            </Pressable>
          </ThemedView>
        )}

        {cart.activity.length > 0 && <ActivityFeed entries={cart.activity} accentColor={theme.accent} />}
      </ScrollView>

      <SearchModal
        visible={searchOpen}
        kind={activeTab}
        onClose={() => setSearchOpen(false)}
        onAdd={(recipeId, name) => {
          addToCartWithLimitCheck(recipeId, name);
          setSearchOpen(false);
        }}
        search={searchRecipes}
        headcount={headcount}
      />
    </SafeAreaView>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function activityLine(entry: ActivityEntry): string {
  const actor = entry.actorDisplayName ?? 'Someone';
  switch (entry.eventType) {
    case 'cart_add':
      return `${actor} added ${entry.recipeName}`;
    case 'cart_remove':
      return `${actor} removed ${entry.recipeName}`;
    case 'cart_quantity_change':
      return `${actor} changed ${entry.recipeName} · ×${entry.fromQty} → ×${entry.toQty}`;
    case 'attendance_change':
      return entry.isOut ? `${actor} is out tonight` : `${actor} is back in`;
  }
}

function ActivityFeed({ entries, accentColor }: { entries: ActivityEntry[]; accentColor: string }) {
  const shown = entries.slice(0, 8);
  return (
    <CollapsibleSection title="Who did what" summary={`${shown.length} update${shown.length === 1 ? '' : 's'}`}>
      <ThemedView style={styles.activityList}>
        {shown.map((entry) => (
          <ThemedView key={entry.id} style={styles.activityRow}>
            <ThemedView style={[styles.activityDot, { backgroundColor: accentColor }]} />
            <ThemedView style={styles.activityTextCol}>
              <ThemedText type="default">{activityLine(entry)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatTime(entry.createdAt)}
                {entry.eventType === 'attendance_change' && entry.reason ? ` · "${entry.reason}"` : ''}
              </ThemedText>
            </ThemedView>
          </ThemedView>
        ))}
      </ThemedView>
    </CollapsibleSection>
  );
}

function EmptyCartAtLock({
  flatId,
  meals,
  takeFallback,
  getFallbackSuggestions,
}: {
  flatId: string | null | undefined;
  meals: MealType[];
  takeFallback: (recipeId: string) => Promise<{ error: unknown } | undefined>;
  getFallbackSuggestions: () => Promise<{ main: SuggestionView | null; accompaniment: SuggestionView | null }>;
}) {
  const theme = useTheme();
  const [fallback, setFallback] = useState<{ main: SuggestionView | null; accompaniment: SuggestionView | null } | undefined>(
    undefined
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void getFallbackSuggestions().then(setFallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once on mount; getFallbackSuggestions' identity changes every render (closes over cart), refetching on every render would be wasteful and pointless since the eligible pool doesn't change within a single lock.
  }, []);

  if (dismissed || !flatId) return null;

  async function confirmFallback() {
    if (fallback?.main) await takeFallback(fallback.main.recipeId);
    if (fallback?.accompaniment) await takeFallback(fallback.accompaniment.recipeId);
  }

  const hasFallback = fallback && (fallback.main || fallback.accompaniment);

  return (
    <ThemedView style={[styles.section, { borderColor: theme.danger }, styles.emptyLockCard]}>
      <ThemedView style={[styles.emptyLockTag, { backgroundColor: theme.dangerSoft }]}>
        <ThemedText type="small" style={{ color: theme.danger }}>
          Cart locked · still empty
        </ThemedText>
      </ThemedView>
      <ThemedText type="subtitle">nobody picked anything</ThemedText>
      <ThemedText type="default" themeColor="textSecondary">
        The cart locked with nothing in it. Take a safe fallback, or skip {mealNounList(meals)} altogether.
      </ThemedText>

      {fallback === undefined && (
        <ThemedText type="small" themeColor="textSecondary">
          Finding a fallback…
        </ThemedText>
      )}

      {hasFallback && (
        <ThemedView type="backgroundElement" style={styles.optionsList}>
          <ThemedText type="small" themeColor="textSecondary">
            The fallback, if you take it
          </ThemedText>
          {fallback.main && (
            <ThemedText type="default" style={styles.optionName}>
              {fallback.main.name} · main
            </ThemedText>
          )}
          {fallback.accompaniment && (
            <ThemedText type="default" style={styles.optionName}>
              {fallback.accompaniment.name} · accompaniment
            </ThemedText>
          )}
        </ThemedView>
      )}

      <ThemedView style={styles.lockedActions}>
        <Pressable
          style={[styles.actionButtonOutline, { borderColor: theme.divider }]}
          onPress={() => setDismissed(true)}>
          <ThemedText type="smallBold">
            No {mealNounList(meals)} {mealMomentList(meals)}
          </ThemedText>
        </Pressable>
        {hasFallback && (
          <Pressable style={[styles.actionButton, { backgroundColor: theme.accent }]} onPress={confirmFallback}>
            <ThemedText type="smallBold" style={[styles.actionButtonText, { color: theme.background }]}>
              Take the fallback
            </ThemedText>
          </Pressable>
        )}
      </ThemedView>
    </ThemedView>
  );
}

// One chip per group the user belongs to, labeled by the group's own name —
// switches the whole screen's scope to that group (design doc: "Meal
// switcher chips"). Hidden entirely for single-group users so their screen
// looks unchanged. Fully dynamic: whatever groups the user has joined,
// exactly that many chips render, in whatever order useMyGroups sorts them.
function MealChips({
  groups,
  activeGroupId,
  onSelect,
}: {
  groups: { id: string; name: string }[] | undefined;
  activeGroupId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  if (!groups || groups.length <= 1) return null;

  return (
    <ThemedView style={[styles.tabRow, { backgroundColor: theme.backgroundElement }]}>
      {groups.map((group) => {
        const selected = group.id === activeGroupId;
        return (
          <Pressable
            key={group.id}
            onPress={() => onSelect(group.id)}
            style={[styles.tabOption, selected && { backgroundColor: theme.accentSoft }]}>
            <ThemedText
              type="smallBold"
              style={selected ? { color: theme.accentText } : { color: theme.textSecondary }}>
              {group.name}
            </ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

function groupByKind<T extends { kind: RecipeKind }>(items: T[]): Record<RecipeKind, T[]> {
  return {
    main: items.filter((i) => i.kind === 'main'),
    accompaniment: items.filter((i) => i.kind === 'accompaniment'),
    side: items.filter((i) => i.kind === 'side'),
  };
}

function SearchModal({
  visible,
  kind,
  onClose,
  onAdd,
  search,
  headcount,
}: {
  visible: boolean;
  kind: RecipeKind;
  onClose: () => void;
  onAdd: (recipeId: string, name: string) => void;
  search: (kind: RecipeKind, query: string) => Promise<SuggestionView[]>;
  headcount: number;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SuggestionView[]>([]);
  const [searching, setSearching] = useState(false);

  async function runSearch(text: string) {
    setQuery(text);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const found = await search(kind, text);
    setSearching(false);
    setResults(found);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { backgroundColor: theme.background }]} onPress={(e) => e.stopPropagation()}>
          <ThemedText type="title" style={styles.modalHeading}>
            add {SEARCH_LABEL[kind]}
          </ThemedText>
          <TextInput
            placeholder="Search dishes…"
            placeholderTextColor={theme.textSecondary}
            value={query}
            onChangeText={runSearch}
            autoFocus
            style={[styles.searchInput, { borderColor: theme.divider, color: theme.text, backgroundColor: theme.backgroundElement }]}
          />

          {searching && (
            <ThemedText type="small" themeColor="textSecondary">
              Searching…
            </ThemedText>
          )}

          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Nothing found — or it&apos;s not something the group can all eat.
            </ThemedText>
          )}

          <ScrollView style={styles.modalResults}>
            {results.map((option) => (
              <Pressable
                key={option.recipeId}
                onPress={() => onAdd(option.recipeId, option.name)}
                disabled={option.inCart}
                style={[styles.resultRow, { backgroundColor: theme.backgroundElement }, option.inCart && styles.disabled]}>
                <ThemedView style={styles.resultInfo}>
                  <ThemedText type="default" style={styles.optionName}>
                    {option.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {option.cuisine} · {option.dietClass}
                    {option.inCart ? ' · already in cart' : ''}
                  </ThemedText>
                </ThemedView>
                {!option.inCart && (
                  <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                    +
                  </ThemedText>
                )}
              </Pressable>
            ))}
          </ScrollView>

          <ThemedView style={[styles.hint, { borderColor: theme.divider }]}>
            <ThemedText type="small" themeColor="textSecondary">
              Anything you add starts at <ThemedText type="smallBold">×{headcount}</ThemedText>, the headcount.
            </ThemedText>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CartLineRow({
  line,
  locked,
  accentColor,
  showCappedMessage,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  line: CartLineView;
  locked: boolean;
  accentColor: string;
  showCappedMessage?: boolean;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onRemove?: () => void;
}) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.cartRowContainer}>
      <ThemedView style={styles.cartRow}>
        <ThemedView style={styles.cartRowInfo}>
          <ThemedText type="default" style={styles.optionName}>
            {line.name}
          </ThemedText>
          {line.updatedByDisplayName && (
            <ThemedText type="small" themeColor="textSecondary">
              edited by {line.updatedByDisplayName}
            </ThemedText>
          )}
        </ThemedView>

        {locked ? (
          <ThemedText type="default">{line.quantity}</ThemedText>
        ) : (
          <ThemedView style={styles.stepper}>
            <Pressable style={[styles.stepperButton, { backgroundColor: accentColor }]} onPress={onDecrement}>
              <ThemedText type="smallBold" style={styles.stepperButtonText}>
                −
              </ThemedText>
            </Pressable>
            <ThemedText type="default" style={styles.stepperValue}>
              {line.quantity}
            </ThemedText>
            <Pressable style={[styles.stepperButton, { backgroundColor: accentColor }]} onPress={onIncrement}>
              <ThemedText type="smallBold" style={styles.stepperButtonText}>
                +
              </ThemedText>
            </Pressable>
            <Pressable style={styles.removeButton} onPress={onRemove}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Remove
              </ThemedText>
            </Pressable>
          </ThemedView>
        )}
      </ThemedView>

      {showCappedMessage && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          Already at headcount — nobody else to eat it.
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headcountLink: {
    textDecorationLine: 'underline',
  },
  outToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  section: {
    gap: Spacing.three,
  },
  emptyLockCard: {
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  emptyLockTag: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  warningCard: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    gap: Spacing.two,
  },
  warningKicker: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 11,
  },
  warningActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  warningButton: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: Spacing.half,
    gap: Spacing.half,
  },
  tabOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  optionsList: {
    gap: Spacing.three,
  },
  optionCard: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: Spacing.half,
  },
  optionCardPressed: {
    opacity: 0.7,
  },
  optionName: {
    fontFamily: Fonts.bodyBold,
  },
  searchEntry: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  cartRowContainer: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    gap: Spacing.one,
  },
  cartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cartRowInfo: {
    gap: Spacing.half,
    flexShrink: 1,
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
    minWidth: 20,
    textAlign: 'center',
  },
  removeButton: {
    marginLeft: Spacing.two,
  },
  lockedCard: {
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  lockedKicker: {
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  lockedDishSurface: {
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  lockedDivider: {
    height: 1,
  },
  lockedDishRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  lockedDishName: {
    fontFamily: Fonts.heading,
    fontSize: 20,
    color: '#F1F0F6',
  },
  lockedStat: {
    textAlign: 'center',
  },
  streakTag: {
    alignSelf: 'center',
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  lockedActions: {
    gap: Spacing.two,
  },
  actionButtonOutline: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  lockedOutlineText: {
    color: '#C5B7AC',
  },
  transparent: {
    backgroundColor: 'transparent',
  },
  activityList: {
    gap: Spacing.three,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  activityDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.pill,
    marginTop: 7,
  },
  activityTextCol: {
    flex: 1,
    gap: Spacing.half,
  },
  actionButton: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  actionButtonText: {
    fontFamily: Fonts.bodyBold,
  },
  disabled: {
    opacity: 0.45,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,18,28,0.35)',
  },
  modalSheet: {
    maxHeight: '80%',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalHeading: {
    fontSize: 30,
    lineHeight: 34,
  },
  searchInput: {
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    fontSize: 16,
    fontFamily: Fonts.body,
  },
  modalResults: {
    gap: Spacing.two,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Radius.md,
    marginBottom: Spacing.two,
  },
  resultInfo: {
    gap: Spacing.half,
    flexShrink: 1,
  },
  hint: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
});
