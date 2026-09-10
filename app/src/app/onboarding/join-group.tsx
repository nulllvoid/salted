import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button, Field, Notice, Screen } from '@/components/ui';
import { useActiveGroup } from '@/contexts/active-group';
import { useAction } from '@/hooks/use-action';
import { supabase } from '@/lib/supabase';
export default function JoinGroupScreen() {
  const router = useRouter();
  const { reloadGroups, setActiveGroupId } = useActiveGroup();
  const [code, setCode] = useState('');
  const action = useAction();
  return (
    <Screen>
      <Button secondary onPress={() => router.back()}>
        Back
      </Button>
      <ThemedText type="smallBold" themeColor="accentText">
        PULL UP A CHAIR
      </ThemedText>
      <ThemedText type="title">Join your household.</ThemedText>
      <ThemedText themeColor="textSecondary">
        Enter the 12-character invite code your housemate shared with you.
      </ThemedText>
      <Field
        label="Invite code"
        placeholder="e.g. a1b2c3d4e5f6"
        autoCapitalize="none"
        autoCorrect={false}
        value={code}
        onChangeText={setCode}
        maxLength={30}
      />
      {action.error && <Notice error>{action.error}</Notice>}
      <Button
        busy={action.pending}
        disabled={!/^[a-f0-9]{12}$/i.test(code.trim())}
        onPress={() => {
          void action.run(async () => {
            const { data, error } = await supabase.rpc('join_household', {
              p_code: code.trim(),
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
    </Screen>
  );
}
