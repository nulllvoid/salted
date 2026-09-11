import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FeatureSlides } from '@/components/feature-slides';
import { Loading, Screen } from '@/components/ui';
import { useSession } from '@/hooks/use-session';

const INTRO_KEY = 'salted:intro-seen:v1';
export default function IntroScreen() {
  const router = useRouter();
  const session = useSession();
  const [show, setShow] = useState(false);
  useEffect(() => {
    let mounted = true;
    if (session === undefined) return;
    // Login's existing session guard routes directly home or finishes profile
    // setup. Signed-in users never see the marketing slides automatically.
    if (session) {
      router.replace('/onboarding/login');
      return;
    }
    void AsyncStorage.getItem(INTRO_KEY)
      .then((seen) => {
        if (!mounted) return;
        if (seen) router.replace('/onboarding/login');
        else setShow(true);
      })
      .catch(() => {
        if (mounted) setShow(true);
      });
    return () => {
      mounted = false;
    };
  }, [session, router]);
  function finish() {
    void AsyncStorage.setItem(INTRO_KEY, 'true').catch(() => {});
    router.replace('/onboarding/login');
  }
  if (!show || session)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  return <FeatureSlides onDone={finish} />;
}
