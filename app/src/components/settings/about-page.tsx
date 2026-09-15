import { TextGroup } from '@/components/text-group';
import { useRouter } from 'expo-router';
import { Button, Card } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';

export function AboutPage() {
  const router = useRouter();
  return (
    <Card>
      <TextGroup>
        <ThemedText type="subtitle">About Salted</ThemedText>
        <ThemedText themeColor="textSecondary">
          Shared meals, a shared shopping list, and a clear plan for your cook.
        </ThemedText>
      </TextGroup>
      <Button secondary onPress={() => router.push('/about')}>
        Take the quick tour
      </Button>
    </Card>
  );
}
