import { TextGroup } from '@/components/text-group';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button, Field, Notice, Screen } from '@/components/ui';
import { useActiveGroup } from '@/contexts/active-group';
import { useAction } from '@/hooks/use-action';
import { supabase } from '@/lib/supabase';
import { isValidInviteCode, normalizeInviteCode } from '@/lib/invite-code';
export default function JoinGroupScreen() {
  const router = useRouter();
  const { reloadGroups, setActiveGroupId } = useActiveGroup();
  const [code, setCode] = useState('');
  const action = useAction();
  return (
    <Screen
      footer={
        <Button
          busy={action.pending}
          disabled={!isValidInviteCode(code)}
          onPress={() => {
            void action.run(async () => {
              const { data, error } = await supabase.rpc('join_household', {
                p_code: normalizeInviteCode(code),
              });
              if (error) throw error;
              await reloadGroups();
              setActiveGroupId(data!);
              router.replace('/(tabs)');
            });
          }}
        >
          Join household
        </Button>
      }
    >
      <Button textOnly icon="back" onPress={() => router.back()}>
        Back
      </Button>
      <TextGroup>
        <ThemedText type="eyebrow" themeColor="accentText">
          PULL UP A CHAIR
        </ThemedText>
        <ThemedText type="title">Join your household.</ThemedText>
        <ThemedText themeColor="textSecondary">
          Enter the 12-character invite code your housemate shared with you.
        </ThemedText>
      </TextGroup>
      <Field
        label="Invite code"
        placeholder="e.g. a1b2c3d4e5f6"
        autoCapitalize="none"
        autoCorrect={false}
        value={code}
        onChangeText={setCode}
        editable={!action.pending}
        maxLength={30}
        hint={
          code.trim() && !isValidInviteCode(code)
            ? 'Use all 12 letters (a–f) and numbers from your invite code. Spaces are OK.'
            : undefined
        }
      />
      {action.error && <Notice error>{action.error}</Notice>}
    </Screen>
  );
}
