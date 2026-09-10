import { Redirect } from 'expo-router';
import AppTabs from '@/components/app-tabs';
import { Screen, Loading, Empty } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { useActiveGroup } from '@/contexts/active-group';
export default function TabLayout() {
  const session = useSession();
  const { groups, error, reloadGroups } = useActiveGroup();
  if (session === undefined)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!session) return <Redirect href="/onboarding" />;
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
  if (groups === undefined)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!groups.length) return <Redirect href="/onboarding/choose" />;
  return <AppTabs />;
}
