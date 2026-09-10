import { Screen, Loading, Empty } from '@/components/ui';
import { Redirect } from 'expo-router';

import { useActiveGroup } from '@/contexts/active-group';
import { useSession } from '@/hooks/use-session';

export default function RootIndex() {
  const session = useSession();
  const { groups, error, reloadGroups } = useActiveGroup();

  if (error)
    return (
      <Screen>
        <Empty
          title="Couldn’t load your household"
          detail={error}
          action="Try again"
          onAction={() => {
            void reloadGroups();
          }}
        />
      </Screen>
    );

  if (session === undefined || (session && groups === undefined)) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (!session || !groups || groups.length === 0) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}
