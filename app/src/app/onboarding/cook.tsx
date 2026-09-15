import { TextGroup } from '@/components/text-group';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Loading, Notice, Screen } from '@/components/ui';
import { CookForm } from '@/components/cook-form';
import { useFlatSettings } from '@/hooks/use-flat-settings';
import { useAction } from '@/hooks/use-action';
import { useActiveGroup } from '@/contexts/active-group';
export default function CookScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { activeGroup } = useActiveGroup();
  const { data, error, upsertCook, reload } = useFlatSettings(
    groupId ?? activeGroup?.id,
  );
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const action = useAction();
  return (
    <Screen>
      <TextGroup>
        <ThemedText type="eyebrow" themeColor="accentText">
          YOUR HOUSEHOLD · 2 OF 2
        </ThemedText>
        <ThemedText type="title">Meet your cook.</ThemedText>
        <ThemedText themeColor="textSecondary">
          Save their WhatsApp number and preferred language. They won’t need to
          install an app.
        </ThemedText>
      </TextGroup>
      {error && (
        <>
          <Notice error>{error}</Notice>
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
      {action.error && <Notice error>{action.error}</Notice>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <Card>
            <CookForm
              cook={data.cook}
              save={upsertCook}
              onSaved={() => router.replace('/(tabs)')}
            />
          </Card>
          <Card>
            <ThemedText type="smallBold">
              Invite everyone to the table
            </ThemedText>
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
              {copied ? 'Invite code copied' : 'Copy invite code'}
            </Button>
          </Card>
        </>
      )}
      <Button secondary onPress={() => router.replace('/(tabs)')}>
        I’ll add my cook later
      </Button>
    </Screen>
  );
}
