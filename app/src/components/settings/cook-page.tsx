import { ThemedText } from '@/components/themed-text';
import { CookForm } from '@/components/cook-form';
import { HouseholdSwitcher } from '@/components/settings/household-switcher';
import { Button, Card, Empty, Loading, Notice } from '@/components/ui';
import { useActiveGroup } from '@/contexts/active-group';
import { useFlatSettings } from '@/hooks/use-flat-settings';

// The cook for the active household. CookForm owns its own draft state,
// validation and useAction (and is shared with onboarding/cook.tsx), so this
// page only resolves which household's cook to hand it.
export function CookPage() {
  const { activeGroup } = useActiveGroup();
  return <CookPageContent key={activeGroup?.id ?? 'none'} />;
}
function CookPageContent() {
  const { activeGroup } = useActiveGroup();
  const { data, error, upsertCook, reload } = useFlatSettings(activeGroup?.id);

  return (
    <>
      <HouseholdSwitcher pageLabel="Cook" />

      {!activeGroup && (
        <Empty
          title="No household yet"
          detail="Create or join a household before adding a cook."
        />
      )}

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

      {data && (
        <Card>
          <ThemedText type="subtitle">Cook for {activeGroup?.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {data.cook?.name ?? 'Add your cook’s details'}
          </ThemedText>
          <CookForm key={activeGroup?.id} cook={data.cook} save={upsertCook} />
        </Card>
      )}
    </>
  );
}
