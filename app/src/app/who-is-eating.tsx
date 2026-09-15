import { Spacing } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { formatMealDate } from '@/lib/meal-schedule';
import { ThemedText } from '@/components/themed-text';
import {
  Toggle,
  Button,
  Card,
  Loading,
  Notice,
  Screen,
  ui,
} from '@/components/ui';
import { useActiveGroup } from '@/contexts/active-group';
import { useAttendance } from '@/hooks/use-attendance';
import { useTodayCart } from '@/hooks/use-today-cart';
import { useSession } from '@/hooks/use-session';
import { useAction } from '@/hooks/use-action';
export default function WhoIsEatingScreen() {
  const router = useRouter();
  const { activeGroup, activeMeal, pollDate } = useActiveGroup();
  const session = useSession();
  const { members, error, setMemberOut, reload } = useAttendance(
    activeGroup?.id,
  );
  const { cart } = useTodayCart(activeGroup?.id, session?.user.id);
  const action = useAction();
  return (
    <Screen
      nativeHeader
      footer={<Button onPress={() => router.back()}>Back to the menu</Button>}
    >
      <ThemedText type="eyebrow" themeColor="accentText">
        {activeMeal?.name.toUpperCase()} · {formatMealDate(pollDate)}
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        New dishes start with a serving for everyone who’s in. Check existing
        quantities when the headcount changes.
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
      {members === undefined && !error && <Loading />}
      {cart && cart.isLocked && (
        <Notice>
          The menu is confirmed. Attendance can no longer be changed for this
          meal.
        </Notice>
      )}
      {members?.map((member) => (
        <Card key={member.userId}>
          <View style={ui.row}>
            <View style={{ flex: 1, gap: Spacing.label }}>
              <ThemedText type="bodyBold">
                {member.displayName}
                {member.userId === session?.user.id ? ' (you)' : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {member.dietSummary}
              </ThemedText>
            </View>
            <Toggle
              accessibilityLabel={`${member.displayName} is eating`}
              value={!member.isOut}
              disabled={action.pending || !cart || cart.isLocked}
              onValueChange={(eating) => {
                void action.run(() =>
                  setMemberOut(
                    member.userId,
                    !eating,
                    session?.user.id,
                    cart?.pollId,
                  ),
                );
              }}
            />
          </View>
        </Card>
      ))}
      {members && (
        <Notice>
          {members.filter((m) => !m.isOut).length} of {members.length} people
          eating this meal.
        </Notice>
      )}
    </Screen>
  );
}
