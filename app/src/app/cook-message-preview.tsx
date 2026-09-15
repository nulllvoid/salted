import { useState } from 'react';
import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Empty, Loading, Notice, Screen } from '@/components/ui';
import { useActiveGroup } from '@/contexts/active-group';
import { useCookDispatch } from '@/hooks/use-cook-dispatch';
import { useAction } from '@/hooks/use-action';
import { useRouter } from 'expo-router';
import { conciseCookMessage } from '@/lib/concise-cook-message';
const LABELS = {
  queued: 'Waiting for the message to be prepared',
  mocked: 'Ready to send yourself',
  sent: 'Sent to WhatsApp',
  delivered: 'Delivered to your cook',
  failed: 'Automatic sending didn’t complete',
};
export default function CookMessageScreen() {
  const { activeGroup, activeMeal } = useActiveGroup();
  const { dispatch, error, reload } = useCookDispatch(activeGroup?.id);
  const [english, setEnglish] = useState(false);
  const [copied, setCopied] = useState(false);
  const action = useAction();
  const router = useRouter();
  const hasTranslation = Boolean(
    dispatch?.payloadTranslated?.trim() &&
      dispatch.payloadTranslated.trim() !== dispatch.payloadEn.trim(),
  );
  const body = conciseCookMessage(dispatch
    ? english
      ? dispatch.payloadEn
      : dispatch.payloadTranslated || dispatch.payloadEn
    : '');
  return (
    <Screen nativeHeader>
      <ThemedText type="eyebrow" themeColor="accentText">
        FROM YOUR TABLE TO THE KITCHEN
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        {activeMeal?.name} instructions for {dispatch?.cookName ?? 'your cook'}.
      </ThemedText>
      {(error || action.error) && (
        <Notice error>{error || action.error}</Notice>
      )}
      {dispatch === undefined && !error && (
        <Loading label="Checking your cook’s message…" />
      )}
      {dispatch === null && (
        <Empty
          title="Let’s get your cook ready"
          detail="A message needs a scheduled meal and a cook’s contact details. Check that both are set up."
          action="Set up your cook"
          onAction={() =>
            router.push({
              pathname: '/(tabs)/settings',
              params: { section: 'household' },
            })
          }
        />
      )}
      {dispatch && (
        <>
          <Notice>{LABELS[dispatch.status]}</Notice>
          {dispatch.status === 'queued' ? (
            <Card>
              <ThemedText>
                The message is prepared at your meal’s scheduled message time.
                Come back then to review and send it.
              </ThemedText>
            </Card>
          ) : (
            <>
              <Card>
                <ThemedText selectable>{body}</ThemedText>
              </Card>
              {hasTranslation && (
                <Button secondary onPress={() => {
                  setEnglish((v) => !v);
                  setCopied(false);
                }}>
                  {english ? 'Show cook’s language' : 'Show English'}
                </Button>
              )}
              {(dispatch.status === 'mocked' ||
                dispatch.status === 'failed') && (
                <Notice>
                  Automatic delivery is not available for this message. Open
                  WhatsApp below, review it, and tap Send.
                </Notice>
              )}
              <Button
                disabled={!body}
                busy={action.pending}
                onPress={() => {
                  void action.run(() =>
                    Linking.openURL(
                      `https://wa.me/${dispatch.cookPhone.replace(/\D/g, '')}?text=${encodeURIComponent(body)}`,
                    ),
                  );
                }}
              >
                {dispatch.status === 'sent' || dispatch.status === 'delivered'
                  ? 'Open message in WhatsApp again'
                  : 'Open WhatsApp to send'}
              </Button>
              <Button
                secondary
                disabled={!body}
                onPress={() => {
                  void action.run(async () => {
                    await Clipboard.setStringAsync(body);
                    setCopied(true);
                  });
                }}
              >
                {copied ? 'Message copied' : 'Copy message'}
              </Button>
            </>
          )}
        </>
      )}
      <Button
        secondary
        onPress={() => {
          void reload();
        }}
      >
        Refresh message status
      </Button>
    </Screen>
  );
}
