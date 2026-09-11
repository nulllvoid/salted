import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { CollapsibleSection } from '@/components/collapsible-section';
import { CookForm } from '@/components/cook-form';
import { HouseholdSwitcher } from '@/components/settings/household-switcher';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Loading, Notice, ui } from '@/components/ui';
import { useActiveGroup } from '@/contexts/active-group';
import { useAction } from '@/hooks/use-action';
import { useFlatSettings } from '@/hooks/use-flat-settings';
import { useSession } from '@/hooks/use-session';

// Everything scoped to the household: who is in it, the invite code,
// menu-size preferences, the cook, and leaving.
//
// The cook used to be its own tab. It is one form about one person attached
// to this household, so it sat behind a whole tab of its own while sharing
// this page's useFlatSettings call — a tab to reach a single card.
export function HouseholdPage() {
  const { activeGroup } = useActiveGroup();
  return <HouseholdPageContent key={activeGroup?.id ?? 'none'} />;
}
function HouseholdPageContent() {
  const router = useRouter();
  const session = useSession();
  const { activeGroup, reloadGroups } = useActiveGroup();
  const { data, error, updateFlat, upsertCook, leaveFlat, reload } =
    useFlatSettings(activeGroup?.id);
  const action = useAction();
  const [copied, setCopied] = useState(false);
  const [leave, setLeave] = useState(false);

  return (
    <>
      <HouseholdSwitcher pageLabel="Home" />

      {activeGroup && !data && (
        <Card>
          {error ? (
            <>
              <Notice error>{error}</Notice>
              <Button
                secondary
                onPress={() => {
                  void reload();
                }}
              >
                Retry household
              </Button>
            </>
          ) : (
            <Loading />
          )}
        </Card>
      )}

      {activeGroup && data && (
        <Card>
          <ThemedText type="subtitle">{activeGroup.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {data.members.map((m) => m.displayName).join(' · ')}
          </ThemedText>
          {action.error && <Notice error>{action.error}</Notice>}

          <CollapsibleSection
            title="Invite your housemates"
            summary="Share a code to plan together"
          >
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
              {copied ? 'Code copied' : 'Copy invite code'}
            </Button>
            <Button
              secondary
              onPress={() => {
                void action.run(() =>
                  Share.share({
                    message: `Join ${activeGroup.name} on Salted. Choose “Join with an invite code” and enter ${data.flat.invite_code}.`,
                  }),
                );
              }}
            >
              Share invite
            </Button>
          </CollapsibleSection>

          <CollapsibleSection
            title="Menu size"
            summary="Preferences, not hard limits"
          >
            <ThemedText type="small" themeColor="textSecondary">
              We’ll let you know when your menu has more dishes than you usually
              need.
            </ThemedText>
            {[
              { label: 'Main dishes', key: 'max_mains' as const },
              {
                label: 'Rice, breads & sides',
                key: 'max_accompaniments' as const,
              },
            ].map(({ label, key }) => (
              <View key={key} style={ui.row}>
                <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
                <Button
                  secondary
                  disabled={action.pending || (data.flat[key] ?? 2) <= 1}
                  onPress={() => {
                    void action.run(() =>
                      updateFlat({
                        [key]: Math.max(1, (data.flat[key] ?? 2) - 1),
                      }),
                    );
                  }}
                >
                  −
                </Button>
                <ThemedText>{data.flat[key] ?? 2}</ThemedText>
                <Button
                  secondary
                  disabled={action.pending}
                  onPress={() => {
                    void action.run(() =>
                      updateFlat({ [key]: (data.flat[key] ?? 2) + 1 }),
                    );
                  }}
                >
                  +
                </Button>
              </View>
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title="Your cook"
            summary={data.cook?.name ?? 'Add your cook’s details'}
          >
            <CookForm
              key={activeGroup.id}
              cook={data.cook}
              save={upsertCook}
            />
          </CollapsibleSection>

          <Button secondary onPress={() => setLeave(!leave)}>
            Leave household
          </Button>
          {leave && (
            <>
              <Notice>
                You’ll lose access to this household’s meals. You can rejoin
                with an invite code.
              </Notice>
              <Button secondary onPress={() => setLeave(false)}>
                Keep my membership
              </Button>
              <Button
                busy={action.pending}
                onPress={() => {
                  void action.run(async () => {
                    await leaveFlat(session!.user.id);
                    await reloadGroups();
                  });
                }}
              >
                Leave {activeGroup.name}
              </Button>
            </>
          )}
        </Card>
      )}

      <View style={{ gap: 10 }}>
        <Button
          secondary
          onPress={() => router.push('/onboarding/create-group')}
        >
          Create a household
        </Button>
        <Button secondary onPress={() => router.push('/onboarding/join-group')}>
          Join with an invite code
        </Button>
      </View>
    </>
  );
}
