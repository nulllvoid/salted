import { TextGroup } from '@/components/text-group';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
export default function ChooseScreen() {
  const router = useRouter();
  return (
    <Screen>
      <TextGroup>
        <ThemedText type="eyebrow" themeColor="accentText">
          BETTER MEALS, TOGETHER
        </ThemedText>
        <ThemedText type="title">Who’s at your table?</ThemedText>
        <ThemedText themeColor="textSecondary">
          Create a household for your shared meals, or join the one your
          housemates already use.
        </ThemedText>
      </TextGroup>
      <Card>
        <TextGroup>
          <ThemedText type="subtitle">Start something good.</ThemedText>
          <ThemedText themeColor="textSecondary">
            Set your meals, add your cook, and invite everyone in.
          </ThemedText>
        </TextGroup>
        <Button onPress={() => router.push('/onboarding/create-group')}>
          Create a household
        </Button>
      </Card>
      <Card>
        <TextGroup>
          <ThemedText type="subtitle">Already invited?</ThemedText>
          <ThemedText themeColor="textSecondary">
            All you need is the invite code.
          </ThemedText>
        </TextGroup>
        <Button secondary onPress={() => router.push('/onboarding/join-group')}>
          Join with an invite code
        </Button>
      </Card>
    </Screen>
  );
}
