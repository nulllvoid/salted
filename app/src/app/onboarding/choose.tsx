import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
export default function ChooseScreen() {
  const router = useRouter();
  return (
    <Screen>
      <ThemedText type="smallBold" themeColor="accentText">
        BETTER MEALS, TOGETHER
      </ThemedText>
      <ThemedText type="title">Who’s at your table?</ThemedText>
      <ThemedText themeColor="textSecondary">
        Create a household for your shared meals, or join the one your
        housemates already use.
      </ThemedText>
      <Card>
        <ThemedText type="subtitle">Start something good.</ThemedText>
        <ThemedText themeColor="textSecondary">
          Set your meals, add your cook, and invite everyone in.
        </ThemedText>
        <Button onPress={() => router.push('/onboarding/create-group')}>
          Create a household
        </Button>
      </Card>
      <Card>
        <ThemedText type="subtitle">Already invited?</ThemedText>
        <ThemedText themeColor="textSecondary">
          All you need is the invite code.
        </ThemedText>
        <Button secondary onPress={() => router.push('/onboarding/join-group')}>
          Join with an invite code
        </Button>
      </Card>
    </Screen>
  );
}
