import { Radius, Spacing } from '@/constants/theme';
import { InteractivePressable as Pressable } from '@/components/interactive-pressable';
import { Icon } from '@/components/icon';
import { useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { formatMealDate } from '@/lib/meal-schedule';
import { ThemedText } from '@/components/themed-text';
import {
  Button,
  Card,
  Empty,
  Loading,
  Notice,
  Screen,
  ui,
} from '@/components/ui';
import { useActiveGroup } from '@/contexts/active-group';
import { useGroceryList } from '@/hooks/use-grocery-list';
import { useAction } from '@/hooks/use-action';
import { useTheme } from '@/hooks/use-theme';
export default function GroceryListScreen() {
  const router = useRouter();
  const { activeGroup, pollDate } = useActiveGroup();
  const { data, error, reload, toggleChecked } = useGroceryList(
    activeGroup?.id,
  );
  const action = useAction();
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const groceries = data?.lines.filter((l) => !l.isStaple) ?? [];
  const staples = data?.lines.filter((l) => l.isStaple) ?? [];
  const remaining = groceries.filter((l) => !l.checked);
  const shareText = `${activeGroup?.name} · groceries for ${formatMealDate(pollDate)}\n${remaining.length ? remaining.map((l) => `• ${l.nameEn} — ${l.quantityLabel}`).join('\n') : 'Everything is covered.'}${staples.length ? `\nCheck at home: ${staples.map((l) => l.nameEn).join(', ')}` : ''}`;
  return (
    <Screen
      nativeHeader
      footer={
        data ? (
          <>
            <ThemedText type="smallBold">
              {remaining.length
                ? `${remaining.length} items left to get`
                : 'Everything is covered'}
            </ThemedText>
            <Button
              busy={action.pending}
              onPress={() => {
                void action.run(() => Share.share({ message: shareText }));
              }}
            >
              Share shopping list
            </Button>
            <Button
              secondary
              onPress={() => {
                void action.run(async () => {
                  await Clipboard.setStringAsync(shareText);
                  setCopied(true);
                });
              }}
            >
              {copied ? 'Copied to clipboard' : 'Copy list'}
            </Button>
          </>
        ) : undefined
      }
    >
      <ThemedText type="eyebrow" themeColor="accentText">
        ONE HOUSEHOLD, ONE SHOPPING LIST
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        All your meals for {formatMealDate(pollDate)}. Tick what you have; share
        what’s missing.
      </ThemedText>
      {(error || action.error) && (
        <>
          <Notice error>{error || action.error}</Notice>
          <Button
            secondary
            onPress={() => {
              void reload();
            }}
          >
            Try again
          </Button>
        </>
      )}
      {data === undefined && !error && (
        <Loading label="Putting your shopping list together…" />
      )}
      {data === null && (
        <Empty
          title="Nothing to shop for yet"
          detail="Add dishes to a meal and we’ll work out the ingredients."
          action="Back to your menu"
          onAction={() => router.back()}
        />
      )}
      {data && (
        <>
          {data.provisional && (
            <Notice>
              Some menus are still open. Quantities may change as your
              housemates edit dishes.
            </Notice>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            For {data.dishSummary}
          </ThemedText>
          {['vegetable', 'dairy', 'protein', 'staple', 'other'].map(
            (category) => {
              const lines = groceries
                .filter((l) => l.category === category)
                .sort((a, b) => Number(a.checked) - Number(b.checked));
              return lines.length ? (
                <Card key={category}>
                  <ThemedText type="smallBold">
                    {
                      (
                        {
                          vegetable: 'Vegetables',
                          dairy: 'Dairy',
                          protein: 'Protein',
                          staple: 'Pantry',
                          other: 'Other essentials',
                        } as Record<string, string>
                      )[category]
                    }
                  </ThemedText>
                  {lines.map((item) => (
                    <Pressable
                      key={item.ingredientId}
                      accessibilityRole="checkbox"
                      accessibilityLabel={`${item.nameEn}, ${item.quantityLabel}`}
                      aria-checked={item.checked}
                      accessibilityState={{
                        checked: item.checked,
                        disabled: action.pending,
                      }}
                      disabled={action.pending}
                      onPress={() => {
                        void action.run(() =>
                          toggleChecked(item.ingredientId, !item.checked),
                        );
                      }}
                      style={[
                        ui.row,
                        { minHeight: 60, paddingVertical: Spacing.label },
                      ]}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: Radius.sm,
                          borderWidth: 1.5,
                          borderColor: theme.accentText,
                          backgroundColor: item.checked
                            ? theme.accentText
                            : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {item.checked && (
                          <Icon name="check" color={theme.background} />
                        )}
                      </View>
                      <View style={{ flex: 1, gap: Spacing.micro }}>
                        <ThemedText
                          style={{
                            textDecorationLine: item.checked
                              ? 'line-through'
                              : 'none',
                            color: item.checked
                              ? theme.textSecondary
                              : theme.text,
                          }}
                        >
                          {item.nameEn}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {item.quantityLabel} · {item.dishName}
                        </ThemedText>
                      </View>
                    </Pressable>
                  ))}
                </Card>
              ) : null;
            },
          )}
          {staples.length > 0 && (
            <Card>
              <ThemedText type="smallBold">
                Check the kitchen cupboard
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                {staples.map((l) => l.nameEn).join(' · ')}
              </ThemedText>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
